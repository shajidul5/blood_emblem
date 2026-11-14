$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Join-Path $PSScriptRoot '..\assets\maps\ships'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
public static class ShipArt {
    public static void Prepare(string root) {
        using (var source = new Bitmap(System.IO.Path.Combine(root, "source.png")))
        using (var ships = new Bitmap(512, 512))
        using (var lone = new Bitmap(244, 512))
        using (var mask = new GraphicsPath())
        using (var hull = new GraphicsPath()) {
            mask.AddPolygon(new Point[] {
                new Point(129,0), new Point(139,0), new Point(143,3), new Point(187,3),
                new Point(187,11), new Point(174,12), new Point(190,48), new Point(204,107),
                new Point(213,226), new Point(218,293), new Point(206,367), new Point(179,426),
                new Point(132,487), new Point(110,466), new Point(81,425), new Point(57,369),
                new Point(46,295), new Point(51,214), new Point(54,143), new Point(65,76),
                new Point(79,29), new Point(91,11), new Point(74,11), new Point(74,3), new Point(126,3)
            });
            mask.AddPolygon(new Point[] {
                new Point(380,0), new Point(386,0), new Point(405,45), new Point(434,72),
                new Point(450,103), new Point(466,170), new Point(478,263), new Point(475,344),
                new Point(459,417), new Point(442,463), new Point(420,478), new Point(356,475),
                new Point(326,459), new Point(310,407), new Point(298,334), new Point(298,238),
                new Point(307,168), new Point(320,106), new Point(341,68), new Point(363,47)
            });
            hull.AddPolygon(new Point[] {
                new Point(80,36), new Point(178,34), new Point(198,100), new Point(210,245),
                new Point(211,307), new Point(190,386), new Point(165,433), new Point(131,482),
                new Point(95,436), new Point(66,374), new Point(52,303), new Point(57,217),
                new Point(61,137), new Point(75,64)
            });
            hull.AddPolygon(new Point[] {
                new Point(382,45), new Point(418,66), new Point(445,108), new Point(461,176),
                new Point(474,263), new Point(471,346), new Point(454,421), new Point(438,458),
                new Point(424,468), new Point(352,466), new Point(326,450), new Point(311,393),
                new Point(301,325), new Point(303,235), new Point(317,151), new Point(336,92), new Point(354,66)
            });
            for (int y = 0; y < 512; y++) for (int x = 0; x < 512; x++) {
                var c = source.GetPixel(x,y);
                bool water = !hull.IsVisible(x,y) && c.B > c.R * 1.12 && c.G > c.R * 1.08;
                bool bridge = x >= 198 && x <= 319 && (y >= 226 && y <= 244 || y >= 266 && y <= 282);
                if ((!mask.IsVisible(x,y) || water) && !bridge) continue;
                // Cool moonlight preserves material contrast rather than crushing all shadows.
                var night = Color.FromArgb(c.A, (int)(c.R * .57), (int)(c.G * .64), Math.Min(255,(int)(c.B * .83 + 6)));
                if (!bridge) ships.SetPixel(x,y,night);
                if (x < 244 && !bridge) lone.SetPixel(x,y,night);
                if (x >= 198 && x < 214 && bridge) {
                    var repair = source.GetPixel(x,y-20);
                    if (!(repair.B > repair.R*1.12 && repair.G > repair.R*1.08))
                        lone.SetPixel(x,y,Color.FromArgb(repair.A,(int)(repair.R*.57),(int)(repair.G*.64),(int)(repair.B*.83+6)));
                }
            }
            // Both gangways align to complete logical rows, separated by open water.
            {
                for (int y = 226; y <= 244; y++) for (int x = 198; x <= 319; x++) {
                    var c = source.GetPixel(x,y);
                    ships.SetPixel(x,y,Color.FromArgb(255,(int)(c.R*.57),(int)(c.G*.64),(int)(c.B*.83+6)));
                }
                for (int y = 266; y <= 282; y++) for (int x = 198; x <= 319; x++) {
                    var c = source.GetPixel(x,y);
                    ships.SetPixel(x,y+6,Color.FromArgb(255,(int)(c.R*.57),(int)(c.G*.64),(int)(c.B*.83+6)));
                }
            }
            ships.Save(System.IO.Path.Combine(root,"two-ships.png"),ImageFormat.Png);
            lone.Save(System.IO.Path.Combine(root,"lone-ship.png"),ImageFormat.Png);
        }
    }
}
'@
[ShipArt]::Prepare((Resolve-Path $root).Path)
foreach ($pair in @(@('map_01_two_ships', 'two-ships'), @('map_02_boarders_from_the_deep', 'lone-ship'))) {
    $map = Get-Content -Raw (Join-Path $PSScriptRoot ('..\data\levels\' + $pair[0] + '.json')) | ConvertFrom-Json
    $image = [Drawing.Bitmap]::FromFile((Join-Path $root ($pair[1] + '.png')))
    try {
        $count = 0
        for ($z = 0; $z -lt $map.height; $z++) {
            for ($x = 0; $x -lt $map.width; $x++) {
                if (@('ship_deck', 'ship_steps', 'ship_gangway') -notcontains $map.tiles[$z][$x]) { continue }
                $px = [int][math]::Floor(($x + .5) * $image.Width / $map.width)
                $py = [int][math]::Floor(($z + .5) * $image.Height / $map.height)
                foreach ($dx in @(-4, 0, 4)) {
                    foreach ($dy in @(-4, 0, 4)) {
                        if ($image.GetPixel($px + $dx, $py + $dy).A -eq 0) {
                            throw "$($pair[0]): walkable cell ($x,$z) extends onto transparent water."
                        }
                    }
                }
                $count++
            }
        }
        Write-Output "$($pair[0]): verified $count walkable cells against nine-point artwork foot margins."
    } finally {
        $image.Dispose()
    }
}
