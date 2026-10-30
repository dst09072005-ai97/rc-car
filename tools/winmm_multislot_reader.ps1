Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class MultiSlotWheelReader {
    [StructLayout(LayoutKind.Sequential)]
    public struct JOYINFOEX {
        public uint dwSize;
        public uint dwFlags;
        public uint dwXpos;
        public uint dwYpos;
        public uint dwZpos;
        public uint dwRpos;
        public uint dwUpos;
        public uint dwVpos;
        public uint dwButtons;
        public uint dwButtonNumber;
        public uint dwPOV;
        public uint dwReserved1;
        public uint dwReserved2;
    }

    [DllImport("winmm.dll")]
    public static extern uint joyGetPosEx(uint uJoyID, ref JOYINFOEX pji);

    public static void Run() {
        JOYINFOEX info = new JOYINFOEX();
        info.dwSize = (uint)Marshal.SizeOf(info);
        info.dwFlags = 0xFF; // JOY_RETURNALL

        while (true) {
            for (uint id = 0; id < 16; id++) {
                if (joyGetPosEx(id, ref info) == 0) {
                    Console.WriteLine("W500:" + id + ":" + info.dwXpos + ":" + info.dwYpos + ":" + info.dwZpos + ":" + info.dwRpos + ":" + info.dwUpos + ":" + info.dwVpos + ":" + info.dwButtons);
                    Console.Out.Flush(); // BẮT BUỘC ĐẨY TỨC THỜI — KHÔNG ĐỆM ĐƯỜNG ỐNG
                }
            }
            Thread.Sleep(20); // 50Hz mượt mà
        }
    }
}
"@
[MultiSlotWheelReader]::Run()
