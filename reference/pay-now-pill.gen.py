#!/usr/bin/env python3
"""CC-149 — regenerate the Pay Now pill used in the invoice PDF.

WHY THIS EXISTS AS AN IMAGE: Drive's HTML-to-PDF conversion honours neither CSS
backgrounds (tried CC-144) nor the legacy bgcolor attribute (tried CC-146). Both
rendered as plain text on a real invoice. The shape and fill have to already be
pixels before the converter sees them.

WHY IT IS STATIC: CC-149 dropped the dollar amount from the button, so one image
serves every invoice. The PNG is inlined into Code.js as a base64 literal
(PAY_PILL_PNG), which means no fetch, no cache, no hosting and no publish step.

TO CHANGE THE LABEL OR COLOURS: edit below, run this, then re-inline:
    base64 -w0 pay-now-pill.png
and replace the PAY_PILL_PNG literal in Code.js.

Requires Pillow. Runs on the Pi (python3 + PIL present).
"""
from PIL import Image, ImageDraw, ImageFont

W, H, SCALE = 200, 52, 2          # displayed at 200x52 in a 540px-wide document
LIME = (124, 255, 0, 255)         # #7cff00 — the app accent
INK = (10, 10, 10, 255)           # #0a0a0a — near-black, ~15:1 on lime
LABEL = "Pay Now"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

img = Image.new("RGBA", (W * SCALE, H * SCALE), (255, 255, 255, 0))
d = ImageDraw.Draw(img)
# radius = half the height, which is what makes it a true pill and not a
# rounded rectangle. This is the shape requirement CSS could not deliver.
d.rounded_rectangle([0, 0, W * SCALE - 1, H * SCALE - 1],
                    radius=(H * SCALE) // 2, fill=LIME)
f = ImageFont.truetype(FONT, 42)
bb = d.textbbox((0, 0), LABEL, font=f)
d.text(((W * SCALE - (bb[2] - bb[0])) / 2 - bb[0],
        (H * SCALE - (bb[3] - bb[1])) / 2 - bb[1]), LABEL, font=f, fill=INK)
img.save("pay-now-pill.png")
print("written", img.size)
