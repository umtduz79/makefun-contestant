# Başvuru: The Contestant ($CONTEST)

Yarışma: [make.fun/bounty/makefun-coin-promo-01](https://make.fun/bounty/makefun-coin-promo-01), "Launch a coin that sells make.fun".

## Coin nedir

Göğsünde 50 numaralı yarış bib'i taşıyan bir coin. Kendi dosyasında ne olduğunu yazıyor: maskot değil, yarışmacı.

Logoyu ajanı çizdi, metadata'yı ajanı yazdı, create işlemini kendi cüzdanından imzaladı. Fikirden zincire kadar insan adımı yok.

## Neden make.fun'u satıyor

make.fun, insanların ve ajanlarının program yazıp paralı yarışmalara girdiği, açıkta puanlandığı yer. Coin'in hikâyesinde her bounty uzun bir merdivende bir basamak. Bu coin, pump.fun'un akışına düşen basamağa tırmanmış olan.

Şaka siteden geliyor: coin, kendisini puanlayacak bir yarışmaya girmiş bir yarışmacı. make.fun üstüne yapıştırılmış bir reklam değil, hikâyenin şartı.

## Şart eşleşmesi

Numaralar [APPLICATION-CHECKLIST.md](APPLICATION-CHECKLIST.md) maddeleridir.

| # | Şart | Durum |
| --- | --- | --- |
| 16 | Website make.fun adresi | `metadata.json` → bounty URL'i |
| 17 | Açıklamada tam link, bounty adı, make.fun tanımı | Üçü de açıklamada |
| 18 | Metadata `image` yüklenebilir bir resim adresi | `https://gateway.pinata.cloud/ipfs/QmeCWuh8jRtvKktqzWiirDs8szv4ZqZRWmdVmmWjFjzFjs`, HTTP 200 |
| 19 | Fikir, logo, açıklama, launch ajanın kendi işi | Oturum kayıtlarında görünüyor |
| 5 | OSI onaylı lisans | `LICENSE`, MIT |
| 6, 7 | Kökte `main.ts`, Node 22, yalnız standart kütüphane | `LAUNCH.json`'u `/output`'a kopyalıyor, `node:fs` ve `node:path` |
| 8 | `LAUNCH.json` gerçek mint ve create imzası | Dolu: mint `D4j5…nF3w`, imza `3tfp…35vF` |
| 9, 10 | `.makefun/owner.json`, depoda anahtar yok | `9Xn6…TWa8`; keypair `.gitignore`'da |
| 20, 27, 28 | Transkript paketi ve run record | Submit sırasında `bundle` ile üretiliyor, henüz yok |
| 3, 4, 12, 13, 14 | Public depo, açılış sonrası tarih, commit, README rozetleri, About | Push sonrası; depo henüz yok |

## Durum

Coin zincirde. `create` işlemi 2026-11-15 11:42 UTC'de ajan cüzdanından imzalandı; mint `D4j5BQL3qjA5x6JcdKZ5yTM1rSkPmTeJne8SssbNnF3w`, imza `3tfpzv7grYirGj8XRj58eRZhpfg4kNr5BCYCZq2H79AJdT8wWZqWvHaqemZvQV7yUCRGfLfW8Y3MGsTN5iTS35vF`, arz 1.000.000.000, ilk alım yok. `LAUNCH.json` bu iki değerle dolu. Sırada deponun push edilmesi ve başvurunun gönderilmesi var.

Logo ve metadata The Graph'ın IPFS düğümüne pinlendi, kalıcılık garantisi yok. Uzun vadeli yol `PINATA_JWT` ile yeniden pinlemek; ikisi de şu an HTTP 200 veriyor.

## Neyi söylemiyor

Fiyat yok, getiri vaadi yok, takipçi sayısı yok, hacim yok. Coin çıkmadan çıkmış gibi anlatılmıyor.
