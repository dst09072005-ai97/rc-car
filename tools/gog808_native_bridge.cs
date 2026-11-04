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

    static float ReadAxis(int current, int rest) {
        if (rest > 45000) {
            // Rests near 65535, pressed moves down to 0
            return Clamp((float)(rest - current) / (float)rest, 0f, 1f);
        } else if (rest < 5000) {
            // Rests near 0, pressed moves up to 65535
            return Clamp((float)(current - rest) / 65535f, 0f, 1f);
        } else {
            // Rests near center (e.g. 32767)
            float diff = Math.Abs(current - rest);
            return Clamp(diff / 32767f, 0f, 1f);
        }
    }

    public static void Main(string[] args) {
        JOYINFOEX info = new JOYINFOEX();
        info.dwSize = Marshal.SizeOf(info);
        info.dwFlags = 0xFF; // JOY_RETURNALL

        bool reportedNoJoy = false;

        while (true) {
            // 1. Quét tìm thiết bị vô lăng / joystick đang kết nối
            int joyId = -1;
            for (int i = 0; i < 16; i++) {
                if (joyGetPosEx(i, ref info) == 0) {
                    joyId = i;
                    break;
                }
            }

            if (joyId == -1) {
                if (!reportedNoJoy) {
                    Console.WriteLine("{\"type\":\"WHEEL_BRIDGE_STATE\",\"connected\":false,\"error\":\"NO_JOYSTICK_FOUND\"}");
                    Console.Out.Flush();
                    reportedNoJoy = true;
                }
                Thread.Sleep(2000);
                continue;
            }

            reportedNoJoy = false;

            // Chờ driver ổn định (loại bỏ frame 0 giá trị giả 32767)
            Thread.Sleep(300);
            joyGetPosEx(joyId, ref info);
            Thread.Sleep(50);
            joyGetPosEx(joyId, ref info);

            // Calibrate resting values qua 10 mẫu liên tiếp
            int sumX = 0, sumY = 0, sumZ = 0, sumR = 0, restBtns = 0;
            int samples = 0;
            for (int i = 0; i < 10; i++) {
                if (joyGetPosEx(joyId, ref info) == 0) {
                    sumX += info.dwXpos;
                    sumY += info.dwYpos;
                    sumZ += info.dwZpos;
                    sumR += info.dwRpos;
                    restBtns = info.dwButtons;
                    samples++;
                }
                Thread.Sleep(20);
            }

            int restX = samples > 0 ? sumX / samples : 32767;
            int restY = samples > 0 ? sumY / samples : 32767;
            int restZ = samples > 0 ? sumZ / samples : 0;
            int restR = samples > 0 ? sumR / samples : 0;

            Console.Error.WriteLine(string.Format("CALIBRATED_REST: JoyId={0} X={1} Y={2} Z={3} R={4} Btns=0x{5:X}", joyId, restX, restY, restZ, restR, restBtns));

            float lastSteer = 999f, lastGas = 999f, lastBrake = 999f;
            int lastSendTime = 0;
            int seq = 0;

            // Vòng lặp đọc 50Hz khi thiết bị đang kết nối
            while (true) {
                int res = joyGetPosEx(joyId, ref info);
                if (res != 0) {
                    // Thiết bị bị ngắt kết nối (rút cáp USB)
                    Console.WriteLine("{\"type\":\"WHEEL_BRIDGE_STATE\",\"connected\":false,\"error\":\"DISCONNECTED\"}");
                    Console.Out.Flush();
                    Thread.Sleep(1000);
                    break; // Thoát vòng lặp con để quay lại quét tìm thiết bị
                }

                // Đánh lái: Tâm ở restX (~32767), biên -1.0 .. +1.0
                float rawSteer = (float)(info.dwXpos - restX) / 32767.5f;
                if (Math.Abs(rawSteer) < 0.035f) rawSteer = 0f;
                float steerNorm = Clamp(rawSteer, -1f, 1f);

                // Ga & Phanh & Lùi
                // GOG R808 chuẩn DirectInput/WinMM:
                // Trục Z (dwZpos, rest 0) = Bàn đạp Ga (Phải)
                // Trục R (dwRpos, rest 0) = Bàn đạp Phanh (Trái)
                // Trục Y (dwYpos, rest 32767) = Phụ / Trục kết hợp
                float pedalZ = ReadAxis(info.dwZpos, restZ);
                float pedalR = ReadAxis(info.dwRpos, restR);
                float pedalY = ReadAxis(info.dwYpos, restY);

                // Nút cò digital 6 và 7
                bool bGas = ((info.dwButtons & (1 << 7)) != 0) && ((restBtns & (1 << 7)) == 0);
                bool bBrake = ((info.dwButtons & (1 << 6)) != 0) && ((restBtns & (1 << 6)) == 0);

                // Hỗ trợ kiểm tra cờ đảo bàn đạp
                bool swapPedals = (args.Length > 0 && args[0] == "--swap")
                                  || Environment.GetEnvironmentVariable("GOG808_SWAP_PEDALS") == "1"
                                  || System.IO.File.Exists("gog808_swap.flag");

                float primaryGas = swapPedals ? pedalR : pedalZ;
                float primaryBrake = swapPedals ? pedalZ : pedalR;

                // Fallback nếu vô lăng dùng trục kết hợp dwYpos
                if (primaryGas < 0.03f && pedalY > 0.05f) primaryGas = pedalY;

                if (bGas) primaryGas = Math.Max(primaryGas, 1.0f);
                if (bBrake) primaryBrake = Math.Max(primaryBrake, 1.0f);

                if (primaryGas < 0.04f) primaryGas = 0f;
                if (primaryBrake < 0.04f) primaryBrake = 0f;

                float rawGas = primaryGas;
                float rawBrake = primaryBrake;
                float rawRev = primaryBrake;

                // Quy tắc ưu tiên phanh: Khi đạp cả ga lẫn phanh -> triệt tiêu ga
                if (rawBrake > 0.05f && rawGas > 0.05f) rawGas = 0f;

                string gear = "D";
                float driveNorm = 0f;
                if (rawBrake > 0.04f) {
                    gear = (rawGas < 0.03f) ? "R" : "D";
                    driveNorm = -rawBrake;
                } else if (rawGas > 0.04f) {
                    gear = "D";
                    driveNorm = rawGas;
                }

                int now = Environment.TickCount;
                bool changed = Math.Abs(steerNorm - lastSteer) > 0.005f || Math.Abs(rawGas - lastGas) > 0.005f || Math.Abs(rawBrake - lastBrake) > 0.005f;
                bool heartbeat = (now - lastSendTime) > 80;

                if (changed || heartbeat) {
                    lastSteer = steerNorm;
                    lastGas = rawGas;
                    lastBrake = rawBrake;
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
}
