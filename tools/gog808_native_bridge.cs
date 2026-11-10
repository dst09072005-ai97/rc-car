using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Globalization;

public class Gog808Bridge {
    [StructLayout(LayoutKind.Sequential)]
    public struct JOYINFOEX {
        public int dwSize;
        public int dwFlags;
        public int dwXpos;
        public int dwYpos;
        public int dwZpos;
        public int dwRpos;
        public int dwUpos;
        public int dwVpos;
        public int dwButtons;
        public int dwButtonNumber;
        public int dwPOV;
        public int dwReserved1;
        public int dwReserved2;
    }

    [DllImport("winmm.dll")]
    public static extern int joyGetPosEx(int uJoyID, ref JOYINFOEX pji);

    static float Clamp(float val, float min, float max) {
        if (val < min) return min;
        if (val > max) return max;
        return val;
    }

    static float ReadUnipolarAxis(int current, int rest) {
        if (rest > 45000) {
            // Rests near 65535, pressed moves down to 0
            float diff = (float)(rest - current);
            if (diff < 3500f) return 0f; // 5.5% deadzone an toàn
            return Clamp(diff / (float)rest, 0f, 1f);
        } else {
            // Rests near 0, pressed moves up to 65535
            float diff = (float)(current - rest);
            if (diff < 3500f) return 0f; // 5.5% deadzone an toàn
            return Clamp(diff / 65535f, 0f, 1f);
        }
    }

    public static void Main(string[] args) {
        JOYINFOEX info = new JOYINFOEX();
        info.dwSize = Marshal.SizeOf(info);
        info.dwFlags = 0xFF; // JOY_RETURNALL

        // 1. Quét tìm thiết bị joystick / vô lăng kết nối
        int joyId = -1;
        for (int i = 0; i < 16; i++) {
            if (joyGetPosEx(i, ref info) == 0) {
                joyId = i;
                break;
            }
        }

        if (joyId == -1) {
            Console.WriteLine("{\"connected\":false,\"error\":\"NO_JOYSTICK_FOUND\"}");
            Console.Out.Flush();
            return;
        }

        // 2. Chờ driver ổn định hoàn toàn (bỏ qua frame dummy khởi tạo trong 750ms)
        for (int i = 0; i < 25; i++) {
            joyGetPosEx(joyId, ref info);
            Thread.Sleep(30);
        }

        // 3. Đo đạc giá trị trạng thái nghỉ (rest calibration) qua 15 mẫu
        int sumX = 0, sumY = 0, sumZ = 0, sumR = 0, sumU = 0, restBtns = 0;
        int samples = 0;
        for (int i = 0; i < 15; i++) {
            if (joyGetPosEx(joyId, ref info) == 0) {
                sumX += info.dwXpos;
                sumY += info.dwYpos;
                sumZ += info.dwZpos;
                sumR += info.dwRpos;
                sumU += info.dwUpos;
                restBtns = info.dwButtons;
                samples++;
            }
            Thread.Sleep(20);
        }

        int restX = samples > 0 ? sumX / samples : 32767;
        int restY = samples > 0 ? sumY / samples : 32767;
        int restZ = samples > 0 ? sumZ / samples : 0;
        int restR = samples > 0 ? sumR / samples : 0;
        int restU = samples > 0 ? sumU / samples : 0;

        // Chuẩn hóa điểm nghỉ cho các trục unipolar (nghỉ tại 0 hoặc 65535)
        if (restZ < 8000) restZ = 0;
        if (restR < 8000) restR = 0;
        if (restU < 8000) restU = 0;
        if (Math.Abs(restY - 32767) < 4000) restY = 32767;
        if (Math.Abs(restX - 32767) < 4000) restX = 32767;

        Console.Error.WriteLine(string.Format("CALIBRATED_REST: JoyId={0} X={1} Y={2} Z={3} R={4} U={5} Btns=0x{6:X}", joyId, restX, restY, restZ, restR, restU, restBtns));

        float lastSteer = 999f, lastGas = 999f, lastBrake = 999f, lastRev = 999f;
        int lastSendTime = 0;
        int seq = 0;
        int startTick = Environment.TickCount;

        while (true) {
            int res = joyGetPosEx(joyId, ref info);
            if (res != 0) {
                Thread.Sleep(500);
                continue;
            }

            // A. Đánh lái: Tâm ở restX (~32767), biên -1.0 (Trái) .. +1.0 (Phải)
            float rawSteer = (float)(info.dwXpos - restX) / 32767.5f;
            if (Math.Abs(rawSteer) < 0.035f) rawSteer = 0f;
            float steerNorm = Clamp(rawSteer, -1f, 1f);

            // B. Ga & Phanh & Lùi (Chuẩn DirectInput/WinMM hỗ trợ cả bộ 2 bàn đạp và 3 bàn đạp GOG R808):
            // Trục Z (dwZpos, rest 0) = Bàn đạp Ga (Phải)
            // Trục R (dwRpos, rest 0) = Bàn đạp Phanh (Giữa / Trái)
            // Trục U (dwUpos, rest 0) = Bàn đạp Côn / Lùi (Trái)
            float pedalGas = ReadUnipolarAxis(info.dwZpos, restZ);
            float pedalBrake = ReadUnipolarAxis(info.dwRpos, restR);
            float pedalClutch = ReadUnipolarAxis(info.dwUpos, restU);

            // Hỗ trợ chế độ trục kết hợp dwYpos (khi vô lăng gộp chân ga/phanh vào trục đơn):
            float combGas = 0f;
            float combBrake = 0f;
            if (info.dwYpos < restY - 5000) {
                combGas = Clamp((float)(restY - info.dwYpos) / (float)restY, 0f, 1f);
            } else if (info.dwYpos > restY + 5000) {
                combBrake = Clamp((float)(info.dwYpos - restY) / (float)(65535 - restY), 0f, 1f);
            }

            float rawGas = Math.Max(pedalGas, combGas);
            float rawBrake = Math.Max(pedalBrake, combBrake);
            float rawRev = Math.Max(rawBrake, pedalClutch);

            // Digital trigger buttons 6 and 7
            bool bGas = ((info.dwButtons & (1 << 7)) != 0) && ((restBtns & (1 << 7)) == 0);
            bool bBrake = ((info.dwButtons & (1 << 6)) != 0) && ((restBtns & (1 << 6)) == 0);
            if (bGas) rawGas = Math.Max(rawGas, 1.0f);
            if (bBrake) rawRev = Math.Max(rawRev, 1.0f);

            if (rawGas < 0.04f) rawGas = 0f;
            if (rawBrake < 0.04f) rawBrake = 0f;
            if (rawRev < 0.04f) rawRev = 0f;

            // QUY TẮC KHÓA AN TOÀN TUYỆT ĐỐI (INTERLOCK):
            // Bàn đạp Phanh / Côn / Lùi LUÔN triệt tiêu hoàn toàn Ga!
            if (rawRev > 0.04f) {
                rawGas = 0f;
            }

            string gear = "D";
            float driveNorm = 0f;
            if (rawRev > 0.04f) {
                gear = "R";
                driveNorm = -rawRev;
            } else if (rawGas > 0.04f) {
                gear = "D";
                driveNorm = rawGas;
            }

            // Khóa an toàn 2.0s đầu sau khi bật bridge: Luôn giữ Neutral dừng xe tuyệt đối
            if (Environment.TickCount - startTick < 2000) {
                rawGas = 0f;
                rawBrake = 0f;
                rawRev = 0f;
                driveNorm = 0f;
                steerNorm = 0f;
            }

            int now = Environment.TickCount;
            bool changed = Math.Abs(steerNorm - lastSteer) > 0.005f || Math.Abs(rawGas - lastGas) > 0.005f || Math.Abs(rawBrake - lastBrake) > 0.005f || Math.Abs(rawRev - lastRev) > 0.005f;
            bool heartbeat = (now - lastSendTime) > 80;

            if (changed || heartbeat) {
                lastSteer = steerNorm;
                lastGas = rawGas;
                lastBrake = rawBrake;
                lastRev = rawRev;
                lastSendTime = now;
                seq = (seq + 1) % 1000000;

                string json = string.Format(CultureInfo.InvariantCulture,
                    "{{\"type\":\"WHEEL_BRIDGE_STATE\",\"connected\":true,\"joyId\":{0},\"steerNorm\":{1:F4},\"gasNorm\":{2:F4},\"brakeNorm\":{3:F4},\"reverseNorm\":{4:F4},\"driveNorm\":{5:F4},\"gear\":\"{6}\",\"buttons\":{7},\"seq\":{8}}}",
                    joyId, steerNorm, rawGas, rawBrake, rawRev, driveNorm, gear, info.dwButtons, seq
                );
                Console.WriteLine(json);
                Console.Out.Flush();
            }

            Thread.Sleep(20); // 50Hz
        }
    }
}
