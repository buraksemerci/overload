"""Anlatı videosunun son bölümünü işler: telefon ekranı, odak, eğim.

    python scripts/story-screen.py ~/Downloads/hf2 ekran.png

Girdi:
    <klasör>/seg-3.mp4   bardaki öğün → telefonu eline alış (ilk 93 kare)
    <klasör>/seg-4.mp4   telefona yaklaşma
    ekran.png            giriş formunun telefon ekranındaki görüntüsü; sahnenin
                         finalinde `[data-phone-screen]` kutusunun ekran
                         görüntüsü (1920×1080, deviceScaleFactor 3)
Çıktı:
    <klasör>/son.mp4     işlenmiş bölüm; `scripts/story-video.mjs` bunu alıyor

Gereken: numpy, opencv-python-headless. `ffmpeg` `ffmpeg-static`ten bulunuyor.
Uygulamanın bağımlılığı DEĞİL; video yeniden üretildiğinde elle koşuluyor.

--------------------------------------------------------------------------
NE YAPIYOR, NEDEN
--------------------------------------------------------------------------
1. TELEFON EKRANI. Üretilen videoda ekranda anlamsız bir fitness paneli
   ("87") vardı ve final ondan giriş formuna geçiyordu. Artık kadın telefonu
   eline aldığı andan itibaren ekranda giriş formu duruyor — BULANIK. Form
   belirince net hâli tam üstüne oturuyor ve bulanık görüntü netleşiyor gibi
   görünüyor.

   Bulanıklık süs değil: videoya okunur bir metin gömülürse uygulama başka
   bir dile çevrildiğinde video Türkçe, form İngilizce kalır. Bulanık yazı
   hiçbir dilde değil.

   Ekran her karede bulunuyor (açık renkli, düşük doygunluklu, dörtgen bir
   bölge; son kareden geriye doğru zincirleniyor), kenarları çizgiye
   oturtuluyor ve form perspektifle o dörtgene yerleştiriliyor. Ekranın
   önüne geçen parmaklar ten rengiyle ayrılıp korunuyor; ekranın ışığındaki
   değişim (parlama, gölge) yerleştirilen görüntüye taşınıyor.

2. ODAK. Telefon kaldırılırken kamera kadının çevresinde dönüyor ve üretim
   modeli arka plandaki rafları kare kare kaydırıyordu. Kaymayı düzeltmenin
   güvenilir bir yolu yok; görünmez kılmanın yolu var: odak telefona ve ele
   çekiliyor, arka plan yumuşuyor. Sinemada "odak kaydırma"nın kendisi —
   sahne zaten telefona yaklaşırken arka planı bulanıklaştırıyor, bu onu
   birkaç saniye öne alıyor.

3. EĞİM. Kadın telefonu tutarken telefon yarım derece kadar sola yatıktı.
   Göze çarpmıyordu ama form (dik bir dikdörtgen) üstüne oturunca kenarlar
   bir uçta ekranın içinde, öbür uçta dışında kalıyordu. Tutma bölümünde
   kare, telefon dik olacak kadar döndürülüyor; köşelerde boşluk açılmasın
   diye bir o kadar büyütülüyor. Dönüş yavaşça devreye giriyor, bir anda
   değil.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

W, H = 2560, 1440
FPS = 24

#: `seg-3`ün bu karesinden sonrası başka bir ele eriyordu (bkz. story-video.mjs).
SEG3_FRAMES = 93

#: Hikâyenin tamamında bu bölümün ilk karesi — `seg-1` ve `seg-2` 124'er kare.
STORY_OFFSET = 248

#: Telefon ekranı zeminin rengi (`--color-ground`), BGR.
GROUND = (241, 246, 245)


def ffmpeg_path() -> str:
    web = Path(__file__).resolve().parent.parent
    return subprocess.check_output(
        ["node", "-p", "require('ffmpeg-static')"], cwd=web, text=True
    ).strip()


def frames(ffmpeg: str, folder: Path):
    """Bölümün kareleri sırayla, BGR. Belleğe hepsi birden alınmıyor."""
    sources = [(folder / "seg-3.mp4", SEG3_FRAMES), (folder / "seg-4.mp4", None)]
    for path, limit in sources:
        args = [ffmpeg, "-v", "error", "-i", str(path)]
        if limit is not None:
            args += ["-frames:v", str(limit)]
        args += ["-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
        process = subprocess.Popen(args, stdout=subprocess.PIPE)
        assert process.stdout is not None
        size = W * H * 3
        while True:
            chunk = process.stdout.read(size)
            if len(chunk) < size:
                break
            yield np.frombuffer(chunk, np.uint8).reshape(H, W, 3)
        process.wait()


# --- 1. Ekranı bulmak ------------------------------------------------------------


def light_mask(frame: np.ndarray) -> np.ndarray:
    """Açık renkli ve doygunluğu düşük pikseller: ekranın zemini."""
    high = frame.max(axis=2).astype(np.int16)
    low = frame.min(axis=2).astype(np.int16)
    mask = ((high > 140) & (high - low < 48)).astype(np.uint8) * 255
    # Kapatma KÜÇÜK: telefonun ışık alan metal kenarı ekrandan yalnızca ince
    # siyah çerçeveyle ayrılıyor; büyük bir çekirdek ikisini birleştirip
    # ekranı yana doğru uzatıyordu.
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    return mask


def order_corners(points: np.ndarray) -> np.ndarray:
    """Sol üst, sağ üst, sağ alt, sol alt."""
    points = points.reshape(4, 2).astype(np.float64)
    total = points.sum(axis=1)
    diff = points[:, 1] - points[:, 0]
    return np.array(
        [
            points[np.argmin(total)],
            points[np.argmin(diff)],
            points[np.argmax(total)],
            points[np.argmax(diff)],
        ]
    )


def intersect(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """İki doğrunun kesişimi; doğrular (vx, vy, x0, y0)."""
    (vx1, vy1, x1, y1), (vx2, vy2, x2, y2) = a, b
    matrix = np.array([[vx1, -vx2], [vy1, -vy2]])
    t = np.linalg.solve(matrix, np.array([x2 - x1, y2 - y1]))
    return np.array([x1 + t[0] * vx1, y1 + t[0] * vy1])


def fit_side_lines(points: np.ndarray, rough: np.ndarray, tolerance: float) -> list[np.ndarray] | None:
    lines = []
    for index in range(4):
        start, end = rough[index], rough[(index + 1) % 4]
        direction = end - start
        length = np.linalg.norm(direction)
        if length < 8:
            return None
        unit = direction / length
        normal = np.array([-unit[1], unit[0]])
        relative = points - start
        along = relative @ unit
        across = np.abs(relative @ normal)
        keep = (along > 0.12 * length) & (along < 0.88 * length) & (across < tolerance)
        if index == 0:
            # Üst kenarın ortası çentik: oradaki noktalar kenarı aşağı büker.
            keep &= (along < 0.28 * length) | (along > 0.72 * length)
        if keep.sum() < 8:
            lines.append(np.array([unit[0], unit[1], start[0], start[1]]))
            continue
        line = cv2.fitLine(points[keep].astype(np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01)
        lines.append(line.reshape(4).astype(np.float64))
    return lines


def fit_quad(contour: np.ndarray) -> np.ndarray | None:
    """Yuvarlatılmış köşeli bir ekranın SANAL köşeleri.

    Köşeler yuvarlak; dörtgenin köşesi eğrinin üstünde değil, kenarların
    uzantılarının kesiştiği yerde. Kaba dörtgen en küçük çevreleyen
    dikdörtgenden geliyor — çokgen yaklaştırması, ekranın önüne geçen başparmağın
    oyduğu girintiyi köşe sanıyordu. Sonra her kenar, köşelerden uzak
    noktalarına oturtulan bir doğru; iki tur, ikincisi daha dar: perspektif
    dikdörtgeni yamuğa çeviriyor ve ilk turun kenarı gerçeğinden sapabiliyor.
    """
    rough = order_corners(cv2.boxPoints(cv2.minAreaRect(contour)))
    points = contour.reshape(-1, 2).astype(np.float64)
    short = min(np.linalg.norm(rough[1] - rough[0]), np.linalg.norm(rough[3] - rough[0]))

    for tolerance in (max(4.0, 0.1 * short), max(2.0, 0.03 * short)):
        lines = fit_side_lines(points, rough, tolerance)
        if lines is None:
            return None
        try:
            rough = np.array([intersect(lines[(i - 1) % 4], lines[i]) for i in range(4)])
        except np.linalg.LinAlgError:
            return None
    return rough


def quad_area(quad: np.ndarray) -> float:
    return float(cv2.contourArea(quad.astype(np.float32)))


def plausible(quad: np.ndarray, previous: np.ndarray) -> bool:
    area, before = quad_area(quad), quad_area(previous)
    if before <= 0 or not 0.6 < area / before < 1.65:
        return False
    diagonal = np.linalg.norm(previous[2] - previous[0])
    if np.abs(quad - previous).max() > 0.2 * diagonal + 12:
        return False
    width = (np.linalg.norm(quad[1] - quad[0]) + np.linalg.norm(quad[2] - quad[3])) / 2
    height = (np.linalg.norm(quad[3] - quad[0]) + np.linalg.norm(quad[2] - quad[1])) / 2
    # Geniş aralık: telefon yana döndükçe genişlik kısalıyor ve oran büyüyor.
    return width > 5 and 1.2 < height / width < 12


def detect(mask: np.ndarray, predicted: np.ndarray) -> np.ndarray | None:
    """Tahmin edilen dörtgenin çevresinde ekranı arar.

    Arama tahminin biraz büyütülmüş hâliyle SINIRLI. Önce dörtgeni çevreleyen
    kutunun tamamına bakılıyordu ve telefon hızla kalkarken ekranın açık
    rengi zemindeki pencere yansımalarıyla birleşip dörtgeni sola uzatıyordu.
    """
    center = predicted.mean(axis=0)
    grown = center + (predicted - center) * 1.35
    direction = grown - center
    grown = grown + 30 * direction / np.linalg.norm(direction, axis=1, keepdims=True)

    limit = np.zeros_like(mask)
    cv2.fillConvexPoly(limit, np.round(grown).astype(np.int32), 255)
    region = cv2.bitwise_and(mask, limit)

    contours, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < 400:
        return None
    return fit_quad(contour)


def track(masks: list[np.ndarray], last: np.ndarray, scale: float) -> list[np.ndarray | None]:
    """Son kareden geriye doğru. Zincir koptuğu yerde durur.

    Arama bir sonraki karenin dörtgeninden değil, HIZINDAN tahmin ediliyor:
    telefon kalkarken kareler arasında 100 pikseli bulan hareket var ve
    durağan bir tahmin ekranı arama bölgesinin dışında bırakıyordu.
    """
    quads: list[np.ndarray | None] = [None] * len(masks)
    previous = last * scale
    before: np.ndarray | None = None
    for index in range(len(masks) - 1, -1, -1):
        predicted = previous if before is None else previous + (previous - before)
        quad = detect(masks[index], predicted)
        if quad is None or not plausible(quad, predicted):
            break
        quads[index] = quad / scale
        before, previous = previous, quad
    return quads


def smooth_quads(quads: list[np.ndarray | None]) -> list[np.ndarray | None]:
    """Titremeyi alan kısa bir zaman ortalaması (0,25 / 0,5 / 0,25)."""
    result: list[np.ndarray | None] = []
    for index, quad in enumerate(quads):
        if quad is None:
            result.append(None)
            continue
        weights, total = [], np.zeros((4, 2))
        for offset, weight in ((-1, 0.25), (0, 0.5), (1, 0.25)):
            other = quads[index + offset] if 0 <= index + offset < len(quads) else None
            if other is not None:
                total += weight * other
                weights.append(weight)
        result.append(total / sum(weights))
    return result


# --- 2. Ekran içeriği ------------------------------------------------------------

#: Son karede ölçülen telefon ekranı (story-4.png): genişliğe oranla.
NOTCH = {"x": (1129 - 944) / 620, "width": 245 / 620, "height": 44 / 620}
RADIUS = 54 / 620

CANVAS_W, CANVAS_H = 1240, 2440


def screen_content(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Bulanık form + çentik, ve yuvarlak köşeli saydamlık maskesi."""
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    image = cv2.resize(image, (CANVAS_W, CANVAS_H), interpolation=cv2.INTER_AREA)

    notch_x = int(NOTCH["x"] * CANVAS_W)
    notch_w = int(NOTCH["width"] * CANVAS_W)
    notch_h = int(NOTCH["height"] * CANVAS_W)

    # Çentik bulanıklaşıp zemine yayılmasın: önce zeminle örtülüyor, sonra
    # bulanık görüntünün üstüne keskin olarak geri çiziliyor.
    image[: notch_h + 12, notch_x - 12 : notch_x + notch_w + 12] = GROUND
    corner = int(RADIUS * CANVAS_W)
    alpha = np.zeros((CANVAS_H, CANVAS_W), np.uint8)
    cv2.rectangle(alpha, (corner, 0), (CANVAS_W - corner, CANVAS_H), 255, -1)
    cv2.rectangle(alpha, (0, corner), (CANVAS_W, CANVAS_H - corner), 255, -1)
    for cx, cy in ((corner, corner), (CANVAS_W - corner, corner), (corner, CANVAS_H - corner),
                   (CANVAS_W - corner, CANVAS_H - corner)):
        cv2.circle(alpha, (cx, cy), corner, 255, -1, cv2.LINE_AA)
    image[alpha == 0] = GROUND

    # Yazı hiçbir dilde okunmayacak kadar, düzen (başlık, alanlar, düğme)
    # tanınacak kadar bulanık.
    blurred = cv2.GaussianBlur(image, (0, 0), sigmaX=0.02 * CANVAS_W)

    radius = notch_h // 2
    notch = np.zeros((CANVAS_H, CANVAS_W), np.uint8)
    cv2.rectangle(notch, (notch_x, 0), (notch_x + notch_w, notch_h - radius), 255, -1)
    cv2.rectangle(notch, (notch_x + radius, 0), (notch_x + notch_w - radius, notch_h), 255, -1)
    cv2.circle(notch, (notch_x + radius, notch_h - radius), radius, 255, -1, cv2.LINE_AA)
    cv2.circle(notch, (notch_x + notch_w - radius, notch_h - radius), radius, 255, -1, cv2.LINE_AA)
    notch_alpha = (notch.astype(np.float32) / 255)[..., None]
    blurred = (blurred * (1 - notch_alpha) + np.array([12, 12, 12]) * notch_alpha).astype(np.uint8)

    return blurred, alpha


def skin_mask(frame: np.ndarray) -> np.ndarray:
    """Ekranın önüne geçen parmaklar. Ekran zemini doygunluğu düşük; ten değil."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    hue, saturation, value = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # Kırmızı ile mavi arasında belirgin fark da şart: sıcak ışıktaki koyu
    # gri yazının doygunluğu yüksek ölçülüyor (küçük farklar küçük bir
    # parlaklığa bölünüyor) ve eski görüntünün rakamları ten sanılıp
    # yerleştirilen görüntünün önünde kalıyordu.
    red_blue = frame[..., 2].astype(np.int16) - frame[..., 0].astype(np.int16)
    skin = (
        ((hue <= 22) | (hue >= 172)) & (saturation >= 60) & (value >= 55) & (red_blue >= 18)
    ).astype(np.uint8) * 255
    skin = cv2.morphologyEx(skin, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    skin = cv2.dilate(skin, np.ones((5, 5), np.uint8))
    return cv2.GaussianBlur(skin, (0, 0), 2)


def composite_screen(
    frame: np.ndarray,
    quad: np.ndarray,
    content: np.ndarray,
    alpha: np.ndarray,
    reference: np.ndarray,
    light_weight: float,
    fade: float,
) -> np.ndarray:
    source = np.array(
        [[0, 0], [CANVAS_W, 0], [CANVAS_W, CANVAS_H], [0, CANVAS_H]], np.float32
    )
    matrix = cv2.getPerspectiveTransform(source, quad.astype(np.float32))

    x0, y0 = np.floor(quad.min(axis=0)).astype(int) - 4
    x1, y1 = np.ceil(quad.max(axis=0)).astype(int) + 4
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
    if x1 <= x0 or y1 <= y0:
        return frame
    shift = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], np.float64)
    local = shift @ matrix
    size = (x1 - x0, y1 - y0)

    warped = cv2.warpPerspective(content, local, size, flags=cv2.INTER_LINEAR)
    weight = cv2.warpPerspective(alpha, local, size, flags=cv2.INTER_LINEAR).astype(np.float32) / 255

    region = frame[y0:y1, x0:x1].astype(np.float32)

    # Ekranın ışığı: orijinal ekranın koyu öğeleri (yazı, halka) büyük bir
    # maksimum süzgeciyle siliniyor, kalan yumuşak aydınlık yerleştirilen
    # görüntüye çarpan oluyor. Son karelerde etkisi sıfıra iniyor ki form
    # belirdiğinde düz zeminle aynı parlaklıkta olsun.
    if light_weight > 0:
        small = cv2.resize(region, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
        lit = cv2.dilate(small, np.ones((9, 9), np.uint8))
        lit = cv2.GaussianBlur(lit, (0, 0), 6)
        lit = cv2.resize(lit, size, interpolation=cv2.INTER_LINEAR)
        gain = np.clip(lit / reference, 0.55, 1.12)
        gain = 1 + (gain - 1) * light_weight
        warped = np.clip(warped.astype(np.float32) * gain, 0, 255)

    occluder = skin_mask(frame[y0:y1, x0:x1]).astype(np.float32) / 255
    weight = weight * (1 - occluder)

    # Telefonun siyah çerçevesi korunuyor. Başparmak ekranın kenarını
    # örttüğünde kenar doğrusu birkaç piksel dışarı kayabiliyor ve form
    # çerçevenin üstüne taşıyordu. Dörtgenin kenar şeridindeki çok koyu
    # pikseller çerçeve (ya da çentik — o da zaten gerçek çentikle aynı yerde).
    band = np.zeros((y1 - y0, x1 - x0), np.uint8)
    width = np.linalg.norm(quad[1] - quad[0])
    # Dar: ekranın kenarına yakın koyu arayüz öğeleri (eski görüntünün yazısı)
    # çerçeve sanılıp korunmasın.
    thickness = max(3, int(0.035 * width))
    cv2.polylines(band, [np.round(quad - [x0, y0]).astype(np.int32)], True, 255, thickness * 2)
    dark = frame[y0:y1, x0:x1].max(axis=2) < 70
    bezel = cv2.GaussianBlur(((band > 0) & dark).astype(np.float32), (0, 0), 1.2)
    weight = weight * (1 - np.clip(bezel * 1.5, 0, 1))
    weight = (weight * fade)[..., None]

    out = frame.copy()
    out[y0:y1, x0:x1] = np.clip(region * (1 - weight) + warped * weight, 0, 255).astype(np.uint8)
    return out


# --- 3. Odak ------------------------------------------------------------------

#: Telefon henüz bulunamayan karelerde odak noktası: elle, kareler üzerinden
#: işaretlendi (hikâye karesi → 2560×1440'ta nokta). Arası doğrusal.
FOCUS_KEYS = {
    284: (1480, 900), 288: (1408, 973), 292: (1357, 957), 296: (1306, 947),
    300: (1306, 968), 304: (1331, 1019), 308: (1254, 1070), 312: (1167, 968),
    316: (1167, 937), 320: (1152, 886), 324: (1167, 758), 328: (1229, 732),
    332: (1280, 676),
}


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def focus_strength(story: int) -> float:
    """Odak kaydırmanın gücü: kalkış başlarken artıyor, sahnenin kendi derin
    alan bulanıklığı devraldığında çekiliyor."""
    return smoothstep(282, 312, story) * (1 - smoothstep(340, 364, story))


def focus_center(story: int, quad: np.ndarray | None) -> tuple[float, float, float, float]:
    if quad is not None:
        center = quad.mean(axis=0)
        width = np.linalg.norm(quad[1] - quad[0])
        height = np.linalg.norm(quad[3] - quad[0])
        # Elin de keskin kalması için odak ekranın biraz altında.
        return center[0], center[1] + 0.25 * height, max(430, 1.5 * width), max(400, 0.95 * height)
    keys = sorted(FOCUS_KEYS)
    story = min(max(story, keys[0]), keys[-1])
    for a, b in zip(keys, keys[1:]):
        if a <= story <= b:
            t = (story - a) / (b - a)
            (xa, ya), (xb, yb) = FOCUS_KEYS[a], FOCUS_KEYS[b]
            return xa + (xb - xa) * t, ya + (yb - ya) * t, 430, 400
    x, y = FOCUS_KEYS[keys[-1]]
    return x, y, 430, 400


_grid = None


def apply_focus(frame: np.ndarray, strength: float, focus: tuple[float, float, float, float]) -> np.ndarray:
    global _grid
    if strength <= 0.01:
        return frame
    if _grid is None:
        ys, xs = np.mgrid[0:H:4, 0:W:4]
        _grid = (xs.astype(np.float32), ys.astype(np.float32))
    xs, ys = _grid
    cx, cy, rx, ry = focus
    distance = np.sqrt(((xs - cx) / rx) ** 2 + ((ys - cy) / ry) ** 2)
    weight = np.clip((distance - 0.85) / 0.9, 0, 1)
    weight = weight * weight * (3 - 2 * weight)
    weight = cv2.resize(weight, (W, H), interpolation=cv2.INTER_LINEAR)[..., None]

    # Bulanıklık gücüyle birlikte BÜYÜYOR — sabit bir bulanık kopyayı
    # karıştırmak odak değil, çift görüntü gibi duruyor.
    sigma = 1 + 10 * strength
    small = cv2.resize(frame, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    blurred = cv2.GaussianBlur(small, (0, 0), sigma / 2)
    blurred = cv2.resize(blurred, (W, H), interpolation=cv2.INTER_LINEAR)
    mix = (weight * min(1.0, strength * 1.4)).astype(np.float32)
    mixed = frame.astype(np.float32) * (1 - mix) + blurred.astype(np.float32) * mix
    return np.clip(mixed, 0, 255).astype(np.uint8)


# --- 4. Eğim ------------------------------------------------------------------


def tilt(quad: np.ndarray) -> float:
    """Ekranın dikeyden sapması, derece. Negatif: üst kenar sola yatık."""
    left = quad[0] - quad[3]
    right = quad[1] - quad[2]
    angles = [np.degrees(np.arctan2(v[0], -v[1])) for v in (left, right)]
    return float(np.mean(angles))


def cover_scale(angle: float, center: tuple[float, float]) -> float:
    """Döndürülen kare pencereyi köşelerde boşluk bırakmadan örtsün."""
    radians = np.radians(angle)
    cos, sin = np.cos(radians), np.sin(radians)
    cx, cy = center
    scale = 1.0
    while scale < 1.2:
        ok = True
        for x, y in ((0, 0), (W, 0), (W, H), (0, H)):
            dx, dy = (x - cx) / scale, (y - cy) / scale
            # Çıkıştaki köşe, girişte nereden geliyor.
            sx = cx + cos * dx - sin * dy
            sy = cy + sin * dx + cos * dy
            if not (0 <= sx <= W and 0 <= sy <= H):
                ok = False
                break
        if ok:
            return scale + 0.002
        scale += 0.001
    return scale


def main() -> None:
    folder = Path(sys.argv[1]).expanduser()
    screen = Path(sys.argv[2]).expanduser()
    analyse_only = "--analiz" in sys.argv
    ffmpeg = ffmpeg_path()

    # Geçiş 1: ekran maskeleri (yarım çözünürlük) ve kare sayısı.
    masks: list[np.ndarray] = []
    for frame in frames(ffmpeg, folder):
        masks.append(light_mask(cv2.resize(frame, (W // 2, H // 2), interpolation=cv2.INTER_AREA)))
    total = len(masks)

    last = np.array([[944, 84], [1564, 84], [1564, 1304], [944, 1304]], np.float64)
    raw = track(masks, last, 0.5)
    del masks
    quads = smooth_quads(raw)
    first = next(i for i, q in enumerate(quads) if q is not None)
    print(f"{total} kare; ekran {first}. kareden (hikâyede {STORY_OFFSET + first}) itibaren bulundu")

    # Eğim: tutma bölümünde (seg-4) ölçülüp yumuşatılıyor.
    angles = np.array([tilt(q) if q is not None else 0.0 for q in quads])
    smooth_angles = cv2.GaussianBlur(angles.reshape(-1, 1), (1, 0), sigmaX=0, sigmaY=4).reshape(-1)

    (folder / "son.json").write_text(
        json.dumps(
            {
                "first": first,
                "quads": [q.tolist() if q is not None else None for q in quads],
                "angles": smooth_angles.tolist(),
            }
        )
    )
    if analyse_only:
        return

    content, alpha = screen_content(screen)
    reference = None

    # Işık referansı: son karede ekranın aydınlığı.
    for index, frame in enumerate(frames(ffmpeg, folder)):
        if index == total - 1:
            quad = quads[index]
            assert quad is not None
            x0, y0 = quad.min(axis=0).astype(int)
            x1, y1 = quad.max(axis=0).astype(int)
            region = frame[y0:y1, x0:x1].astype(np.float32)
            small = cv2.resize(region, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
            lit = cv2.GaussianBlur(cv2.dilate(small, np.ones((9, 9), np.uint8)), (0, 0), 6)
            reference = np.median(lit.reshape(-1, 3), axis=0)
    assert reference is not None

    encoder = subprocess.Popen(
        [
            ffmpeg, "-v", "error", "-y",
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
            "-c:v", "libx264", "-preset", "slow", "-crf", "10", "-pix_fmt", "yuv420p",
            str(folder / "son.mp4"),
        ],
        stdin=subprocess.PIPE,
    )
    assert encoder.stdin is not None

    for index, frame in enumerate(frames(ffmpeg, folder)):
        story = STORY_OFFSET + index
        quad = quads[index]
        out = frame
        if quad is not None:
            light_weight = 1 - smoothstep(total - 40, total - 8, index)
            # Ekran bulunduğu ilk karelerde görüntü yavaşça beliriyor: o anda
            # telefon neredeyse yan duruyor ve başparmak ekranın üstünde.
            fade = smoothstep(first - 1, first + 5, index)
            out = composite_screen(out, quad, content, alpha, reference, light_weight, fade)

        out = apply_focus(out, focus_strength(story), focus_center(story, quad))

        # Eğim düzeltmesi yalnızca tutma bölümünde ve yavaşça.
        weight = smoothstep(SEG3_FRAMES, SEG3_FRAMES + 60, index)
        if quad is not None and weight > 0:
            angle = -smooth_angles[index] * weight
            center = tuple(quad.mean(axis=0))
            scale = cover_scale(angle, center)
            matrix = cv2.getRotationMatrix2D(center, -angle, scale)
            out = cv2.warpAffine(out, matrix, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)

        encoder.stdin.write(np.ascontiguousarray(out).tobytes())
        if index % 20 == 0:
            print(f"  {index}/{total}")

    encoder.stdin.close()
    encoder.wait()
    print(folder / "son.mp4")


if __name__ == "__main__":
    main()
