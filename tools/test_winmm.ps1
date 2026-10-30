Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class WinMmTest {
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

    public static void CheckJoysticks() {
        JOYINFOEX info = new JOYINFOEX();
        info.dwSize = (uint)Marshal.SizeOf(info);
        info.dwFlags = 0xFF; // JOY_RETURNALL
        bool found = false;
        for (uint id = 0; id < 16; id++) {
            uint res = joyGetPosEx(id, ref info);
            if (res == 0) {
                Console.WriteLine("FOUND: id=" + id + " X=" + info.dwXpos + " Y=" + info.dwYpos + " Z=" + info.dwZpos + " R=" + info.dwRpos + " Buttons=" + info.dwButtons);
                found = true;
            }
        }
        if (!found) {
            Console.WriteLine("NO_JOYSTICK_FOUND");
        }
        Console.WriteLine("SCAN_DONE");
    }
}
"@
[WinMmTest]::CheckJoysticks()
