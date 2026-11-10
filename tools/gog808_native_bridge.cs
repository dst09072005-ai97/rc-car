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
            float diff = (float)(rest - current);
            if (diff < 3500f) return 0f; // 5.5% deadzone an toàn
            return Clamp(diff / (float)rest, 0f, 1f);
        } else if (rest < 8000) {
            // Rests near 0, pressed moves up to 65535
            float diff = (float)(current - rest);
            if (diff < 3500f) return 0f; // 5.5% deadzone an toàn
            return Clamp(diff / 65535f, 0f, 1f);
        } else {
            // Rests near center (e.g. 32767) - CHỈ nhận khi lệch lớn (>15%) để chống phantom throttle khi cắm vô lăng
            float diff = Math.Abs(current - rest);
            if (diff < 5000f) return 0f; // 15% deadzone an toàn chống nhiễu
            return Clamp(diff / 32767f, 0f, 1f);
        }
    }

    public static void Main(string[] args) {
        JOYINFOEX info = new JOYINFOEX();
        info.dwSize = Marshal.SizeOf(info);
        info.dwFlags = 0xFF; // JOY_RETURNALL

        // 1. Find connected joystick
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

        // Settle driver (discard initial dummy frames)
        Thread.Sleep(500);
        joyGetPosEx(joyId, ref info);
        Thread.Sleep(100);
        joyGetPosEx(joyId, ref info);

        // Calibrate resting values over 15 samples
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

        Console.Error.WriteLine(string.Format("CALIBRATED_REST: JoyId={0} X={1} Y={2} Z={3} R={4} Btns=0x{5:X}", joyId, restX, restY, restZ, restR, restBtns));

        float lastSteer = 999f, lastGas = 999f, lastBrake = 999f;
        int lastSendTime = 0;
        int seq = 0;
        int startTick = Environment.TickCount;

        while (true) {
            int res = joyGetPosEx(joyId, ref info);
            if (res != 0) {
                Thread.Sleep(500);
                continue;
            }

            // Steer: Centered at restX (~32767), range -1.0 .. +1.0
            float rawSteer = (float)(info.dwXpos - restX) / 32767.5f;
            if (Math.Abs(rawSteer) < 0.035f) rawSteer = 0f;
            float steerNorm = Clamp(rawSteer, -1f, 1f);

            // Gas & Brake
            float rawGas = ReadAxis(info.dwYpos, restY);
            float rawBrake = ReadAxis(info.dwZpos, restZ);
            float rawRev = ReadAxis(info.dwRpos, restR);

            // Digital trigger buttons 6 and 7
            bool bGas = ((info.dwButtons & (1 << 7)) != 0) && ((restBtns & (1 << 7)) == 0);
            bool bBrake = ((info.dwButtons & (1 << 6)) != 0) && ((restBtns & (1 << 6)) == 0);
            if (bGas) rawGas = Math.Max(rawGas, 1.0f);
            if (bBrake) rawBrake = Math.Max(rawBrake, 1.0f);

            if (rawGas < 0.04f) rawGas = 0f;
            if (rawBrake < 0.04f) rawBrake = 0f;
            if (rawRev < 0.04f) rawRev = 0f;

            // Brake overrides gas
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

            // Khóa an toàn 2.0s đầu sau khi bật bridge: Luôn giữ Neutral dừng xe tuyệt đối
            if (Environment.TickCount - startTick < 2000) {
                rawGas = 0f;
                rawBrake = 0f;
                rawRev = 0f;
                driveNorm = 0f;
                steerNorm = 0f;
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
                    "{{\"type\":\"WHEEL_BRIDGE_STATE\",\"connected\":true,\"steerNorm\":{0:F4},\"gasNorm\":{1:F4},\"brakeNorm\":{2:F4},\"reverseNorm\":{3:F4},\"driveNorm\":{4:F4},\"gear\":\"{5}\",\"buttons\":{6},\"seq\":{7}}}",
                    steerNorm, rawGas, rawBrake, rawRev, driveNorm, gear, info.dwButtons, seq
                );
                Console.WriteLine(json);
                Console.Out.Flush();
            }

            Thread.Sleep(20); // 50Hz
        }
    }
}
