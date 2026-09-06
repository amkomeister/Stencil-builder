from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / ".test-fixtures"
root.mkdir(exist_ok=True)


def portrait():
    image = Image.new("RGB", (900, 1200), "#b9d6ca")
    draw = ImageDraw.Draw(image)
    draw.ellipse((170, 92, 730, 772), fill="#d6a77c")
    draw.pieslice((135, 35, 765, 725), 175, 365, fill="#2c2825")
    draw.polygon([(180, 340), (105, 560), (230, 510)], fill="#2c2825")
    draw.polygon([(720, 340), (800, 585), (670, 510)], fill="#2c2825")
    draw.ellipse((270, 370, 385, 435), fill="#f4eee5")
    draw.ellipse((515, 370, 630, 435), fill="#f4eee5")
    draw.ellipse((315, 390, 350, 425), fill="#242420")
    draw.ellipse((550, 390, 585, 425), fill="#242420")
    draw.polygon([(450, 390), (405, 570), (485, 560)], fill="#b9785c")
    draw.arc((330, 500, 580, 690), 25, 155, fill="#5b3028", width=18)
    draw.rectangle((350, 720, 550, 940), fill="#bd805f")
    draw.polygon([(90, 1200), (155, 865), (350, 790), (450, 980), (550, 790), (745, 865), (820, 1200)], fill="#364a53")
    draw.polygon([(350, 790), (450, 980), (550, 790), (505, 1080), (395, 1080)], fill="#ede9df")
    image.save(root / "portrait-simple.jpg", quality=92)


def animal():
    image = Image.new("RGB", (1200, 900), "#e5d9c8")
    draw = ImageDraw.Draw(image)
    draw.ellipse((200, 260, 940, 750), fill="#6d4f37")
    draw.ellipse((670, 125, 1060, 520), fill="#805c3e")
    draw.polygon([(690, 210), (650, 20), (820, 155)], fill="#3a2e25")
    draw.polygon([(910, 150), (1080, 35), (1020, 280)], fill="#3a2e25")
    draw.ellipse((760, 250, 810, 300), fill="#171714")
    draw.ellipse((925, 245, 975, 295), fill="#171714")
    draw.ellipse((825, 330, 950, 440), fill="#d9b78e")
    draw.ellipse((866, 350, 930, 395), fill="#171714")
    draw.arc((810, 330, 975, 480), 25, 145, fill="#251f1a", width=12)
    draw.rectangle((295, 630, 410, 890), fill="#4d382b")
    draw.rectangle((735, 625, 850, 890), fill="#4d382b")
    draw.arc((80, 230, 430, 650), 95, 260, fill="#6d4f37", width=70)
    image.save(root / "animal-simple.webp", quality=90)


def object_image():
    image = Image.new("RGB", (1200, 900), "#c8d9e9")
    draw = ImageDraw.Draw(image)
    draw.ellipse((150, 740, 1050, 860), fill="#8799aa")
    draw.rounded_rectangle((390, 180, 810, 790), radius=70, fill="#c64f36")
    draw.rectangle((485, 70, 715, 230), fill="#343431")
    draw.rounded_rectangle((455, 285, 745, 590), radius=25, fill="#efe9dc")
    draw.ellipse((515, 330, 685, 500), fill="#d8ff48", outline="#20201d", width=18)
    draw.rectangle((585, 350, 615, 480), fill="#20201d")
    draw.rectangle((545, 400, 655, 430), fill="#20201d")
    image.save(root / "object-simple.png")


def low_contrast():
    image = Image.new("RGB", (1000, 750), "#777a79")
    draw = ImageDraw.Draw(image)
    draw.ellipse((210, 90, 790, 680), fill="#858887")
    draw.ellipse((325, 275, 430, 345), fill="#6f7271")
    draw.ellipse((570, 275, 675, 345), fill="#6f7271")
    draw.polygon([(500, 305), (445, 500), (555, 500)], fill="#737675")
    draw.arc((355, 410, 645, 610), 15, 165, fill="#6b6e6d", width=16)
    image.save(root / "low-contrast.jpg", quality=90)


def transparent():
    image = Image.new("RGBA", (700, 700), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon([(350, 40), (650, 600), (55, 600)], fill="#2a2926")
    draw.ellipse((245, 235, 455, 445), fill="#d8ff48")
    draw.ellipse((300, 290, 400, 390), fill="#2a2926")
    image.save(root / "transparent.png")


def large():
    image = Image.new("RGB", (4000, 3000), "#ded5c7")
    draw = ImageDraw.Draw(image)
    for index in range(18):
        x = 180 + index * 205
        shade = 25 + index * 11
        draw.rectangle((x, 250, x + 150, 2700), fill=(shade, shade, shade))
    draw.ellipse((900, 550, 3100, 2600), outline="#dc5b3f", width=150)
    image.save(root / "large-4000x3000.jpg", quality=88)


portrait()
animal()
object_image()
low_contrast()
transparent()
large()
print(root)
