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

    // Đọc trục chuẩn V504: Tự động nhận diện điểm nghỉ 0, 32767 hoặc 65535
    static float ReadAxis(int current, int rest) {
        if (rest > 45000) {
            // Điểm nghỉ ở 65535, đạp xuống tiến về 0
            float diff = (float)(rest - current);
            if (diff < 2500f) return 0f; // 4% deadzone chống rung
            return Clamp(diff / (float)rest, 0f, 1f);
        } else if (rest < 8000) {
            // Điểm nghỉ ở 0, đạp xuống tiến về 65535
            float diff = (float)(current - rest);
            if (diff < 2500f) return 0f; // 4% deadzone chống rung
            return Clamp(diff / 65535f, 0f, 1f);
        } else {
            // Điểm nghỉ ở tâm (~32767)
            float diff = Math.Abs(current - rest);
            if (diff < 3000f) return 0f;
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
                Thread.Sleep(1500);
                continue;
            }

            reportedNoJoy = false;

            // 2. Chờ driver ổn định (bỏ qua 6 frame dummy khởi tạo)
            Thread.Sleep(400);
            for (int w = 0; w < 6; w++) {
                joyGetPosEx(joyId, ref info);
                Thread.Sleep(25);
            }

            // 3. Đo đạc giá trị trạng thái nghỉ (rest calibration) qua 15 mẫu
            int sumX = 0, sumY = 0, sumZ = 0, sumR = 0, restBtns = 0;
            int samples = 0;
            for (int i = 0; i < 15; i++) {
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

            // Chuẩn hóa điểm nghỉ cho các trục unipolar (nghỉ tại 0, 32767 hoặc 65535)
            if (restZ < 4000) restZ = 0;
            if (restR < 4000) restR = 0;
            if (restZ > 61000) restZ = 65535;
            if (restR > 61000) restR = 65535;
            if (Math.Abs(restY - 32767) < 4000) restY = 32767;
            if (Math.Abs(restX - 32767) < 4000) restX = 32767;

            Console.Error.WriteLine(string.Format("CALIBRATED_REST: JoyId={0} X={1} Y={2} Z={3} R={4} Btns=0x{5:X}", joyId, restX, restY, restZ, restR, restBtns));

            float lastSteer = 999f, lastGas = 999f, lastBrake = 999f, lastRev = 999f;
            float prevGas = 0f, prevBrake = 0f, prevRev = 0f;
            int jumpHoldGas = 0, jumpHoldBrake = 0, jumpHoldRev = 0;
            int lastRawY = restY, lastRawZ = restZ, lastRawR = restR;
            int lastSendTime = 0;
            int seq = 0;
            int startTick = Environment.TickCount;
            bool startupArmChecked = false;

            // Vòng lặp đọc 50Hz khi thiết bị đang kết nối
            while (true) {
                int res = joyGetPosEx(joyId, ref info);
                if (res != 0) {
                    Console.WriteLine("{\"type\":\"WHEEL_BRIDGE_STATE\",\"connected\":false,\"error\":\"DISCONNECTED\"}");
                    Console.Out.Flush();
                    Thread.Sleep(1000);
                    break;
                }

                int elapsedMs = Environment.TickCount - startTick;

                // Khóa & hiệu chuẩn lại trong 1.8s đầu: nếu driver HID báo giá trị nghỉ muộn (0 <-> 65535 hoặc 32767),
                // tự động cập nhật lại điểm nghỉ rest* cho tới khi hết 1.8s khóa an toàn.
                if (elapsedMs < 1800) {
                    if (ReadAxis(info.dwYpos, restY) > 0.35f) restY = info.dwYpos;
                    if (ReadAxis(info.dwZpos, restZ) > 0.35f) restZ = info.dwZpos;
                    if (ReadAxis(info.dwRpos, restR) > 0.35f) restR = info.dwRpos;
                    if (Math.Abs(info.dwXpos - restX) > 20000) restX = info.dwXpos;
                    restBtns = info.dwButtons;
                    lastRawY = info.dwYpos;
                    lastRawZ = info.dwZpos;
                    lastRawR = info.dwRpos;
                } else if (!startupArmChecked) {
                    startupArmChecked = true;
                    // Ngay khoảnh khắc mở khóa an toàn: nếu bất kỳ bàn đạp nào đang kích > 35% mà không có thao tác đạp thực tế,
                    // xem như điểm nghỉ phần cứng bị lệch/ngược cực -> tái chuẩn hóa về vị trí hiện tại (Neutral 0%).
                    if (ReadAxis(info.dwYpos, restY) > 0.35f) restY = info.dwYpos;
                    if (ReadAxis(info.dwZpos, restZ) > 0.35f) restZ = info.dwZpos;
                    if (ReadAxis(info.dwRpos, restR) > 0.35f) restR = info.dwRpos;
                    Console.Error.WriteLine(string.Format("ARMED_REST: JoyId={0} X={1} Y={2} Z={3} R={4} Btns=0x{5:X}", joyId, restX, restY, restZ, restR, restBtns));
                }

                // A. Đánh lái: Tâm ở restX (~32767), biên -1.0 (Trái) .. +1.0 (Phải)
                float rawSteer = (float)(info.dwXpos - restX) / 32767.5f;
                if (Math.Abs(rawSteer) < 0.035f) rawSteer = 0f;
                float steerNorm = Clamp(rawSteer, -1f, 1f);

                // B. Ga, Phanh, Lùi (Chuẩn V504: dwYpos=Ga, dwZpos=Phanh, dwRpos=Lùi)
                float rawGas = ReadAxis(info.dwYpos, restY);
                float rawBrake = ReadAxis(info.dwZpos, restZ);
                float rawRev = ReadAxis(info.dwRpos, restR);

                // Chống kích ga/lùi ảo 100% khi driver WinMM lật cực đột ngột trong 10s đầu hoặc trên trục chưa dùng
                if (elapsedMs >= 1800 && elapsedMs < 10000) {
                    if (rawGas >= 0.88f && (prevGas < 0.10f || jumpHoldGas > 0) && Math.Abs(info.dwYpos - lastRawY) < 400) {
                        jumpHoldGas++;
                        rawGas = 0f;
                        if (jumpHoldGas >= 6) { restY = info.dwYpos; jumpHoldGas = 0; }
                    } else { jumpHoldGas = 0; }

                    if (rawBrake >= 0.88f && (prevBrake < 0.10f || jumpHoldBrake > 0) && Math.Abs(info.dwZpos - lastRawZ) < 400) {
                        jumpHoldBrake++;
                        rawBrake = 0f;
                        if (jumpHoldBrake >= 6) { restZ = info.dwZpos; jumpHoldBrake = 0; }
                    } else { jumpHoldBrake = 0; }

                    if (rawRev >= 0.88f && (prevRev < 0.10f || jumpHoldRev > 0) && Math.Abs(info.dwRpos - lastRawR) < 400) {
                        jumpHoldRev++;
                        rawRev = 0f;
                        if (jumpHoldRev >= 6) { restR = info.dwRpos; jumpHoldRev = 0; }
                    } else { jumpHoldRev = 0; }
                }
                prevGas = rawGas; prevBrake = rawBrake; prevRev = rawRev;
                lastRawY = info.dwYpos; lastRawZ = info.dwZpos; lastRawR = info.dwRpos;

                // Cò digital 6 (Trái) và 7 (Phải) dự phòng
                bool bGas = ((info.dwButtons & (1 << 7)) != 0) && ((restBtns & (1 << 7)) == 0);
                bool bBrake = ((info.dwButtons & (1 << 6)) != 0) && ((restBtns & (1 << 6)) == 0);
                if (bGas) rawGas = Math.Max(rawGas, 1.0f);
                if (bBrake) rawBrake = Math.Max(rawBrake, 1.0f);

                if (rawGas < 0.04f) rawGas = 0f;
                if (rawBrake < 0.04f) rawBrake = 0f;
                if (rawRev < 0.04f) rawRev = 0f;

                // Quy tắc ưu tiên phanh: Khi đạp phanh/lùi -> triệt tiêu ga tuyệt đối
                float pedalRev = Math.Max(rawBrake, rawRev);
                if (pedalRev > 0.04f && rawGas > 0.04f) {
                    rawGas = 0f;
                }

                string gear = "D";
                float driveNorm = 0f;
                if (pedalRev > 0.04f) {
                    gear = "R";
                    driveNorm = -pedalRev;
                } else if (rawGas > 0.04f) {
                    gear = "D";
                    driveNorm = rawGas;
                }

                // Khóa an toàn 1.8s đầu sau khi bật bridge: Luôn giữ Neutral & Gear D dừng xe tuyệt đối
                if (elapsedMs < 1800) {
                    rawGas = 0f;
                    rawBrake = 0f;
                    rawRev = 0f;
                    driveNorm = 0f;
                    steerNorm = 0f;
                    gear = "D";
                }

                int now = Environment.TickCount;
                bool changed = Math.Abs(steerNorm - lastSteer) > 0.005f ||
                               Math.Abs(rawGas - lastGas) > 0.005f ||
                               Math.Abs(rawBrake - lastBrake) > 0.005f ||
                               Math.Abs(rawRev - lastRev) > 0.005f;
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
}
