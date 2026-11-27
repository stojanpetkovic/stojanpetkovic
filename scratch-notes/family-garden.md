# Family Garden — https://family-garden.rs/

Notes gathered for the portfolio page. Screenshots: 1440x900 viewport, taken 2026-11-27.

## Metadata
- Home title: "Dom za stare Pančevo – Family Garden | Nega 24h uz park"
- Home meta description: "Licencirani dom za stara lica u Pančevu, uz Goranski park. Trajni i kratki smeštaj, nega 24h, lekar i sestre, za pokretne, polupokretne i nepokretne. Pozovite."
- /usluge/: "Usluge i nega u domu za stare – Family Garden Pančevo" — "Nega 24h, domski lekar, terapija, nega nepokretnih i osoba sa demencijom, socijalni rad, okupaciona terapija i ishrana sa 5 obroka. Dom Family Garden, Pančevo."
- /smestaj/: "Smeštaj u domu za stare Pančevo – sobe | Family Garden" — "Sobe od jednokrevetnih do četvorokrevetnih i apartmani sa pogledom na Goranski park. Kupatilo, klima, podno grejanje, Wi-Fi i panik taster u svakoj sobi."
- /kontakt/: "Kontakt – Dom za stare Family Garden, Pančevo"
- Language: Serbian, Latin script (`lang="sr-Latn"`), no other languages.

## Main headings
- Home: H1 Dom za stare u Pančevu, sa toplinom porodice. · H2 Dom u kome se živi sa pažnjom. (Smeštaj, Nega 24/7, Aktivnosti) · H2 Prostor za miran život. · H2 Dobra nega počinje poverenjem. (Licencirana ustanova, Individualni plan, Osiguranje u ceni, Saradnja sa porodicom) · H2 Od prvog razgovora do useljenja. (4 steps) · H2 Licencirana ustanova socijalne zaštite. · H2 Dobro je da znate. (7-question FAQ) · H2 Pošaljite upit
- Usluge: H1 Stručna nega i usluge doma. · Medicinska nega i pomoć 24 sata · Demencija, Alchajmer i oporavak posle šloga · Pomagala za nepokretne i polupokretne · Podrška korisniku i porodici · Aktivnosti · Pitanja o nezi
- Smeštaj: H1 Udobne sobe za miran boravak. · Dva nivoa, prilagođena svima · Izaberite sobu po meri (jednokrevetne, dvokrevetne, više kreveta, apartmani) · Pogled na park · Galerija · Zakažite obilazak
- Kontakt: H1 Kontaktirajte dom Family Garden. · Tu smo za vaša pitanja · Pošaljite upit · Kako do nas

## What the business does
Licensed private retirement / care home (dom za stara lica). Permanent and short-term stays (daily, weekly, weekend), 24/7 medical care with a doctor and nurses, care for mobile, semi-mobile and bedridden residents, dementia/Alzheimer's and post-stroke recovery, occupational therapy, 5 meals a day. 42 places, licence from the Ministry of Labour and Social Affairs valid until 2029. Rooms with park view, bathroom, A/C, underfloor heating, Wi-Fi, panic button; chair lift between floors; free parking.

## Location
Stevana Šupljikca 82b, 26000 Pančevo, Serbia, next to Goranski park (business address published on the site). Open daily 7–21 h, care 24/7.

## Tech stack
- Astro static site (hashed `/_astro/` bundles), self-hosted fonts, Cloudflare (Web Analytics beacon).
- Lead tracking via webtano.com/leads.js (Stojan's own tracker).
- Rich JSON-LD: FAQPage, offers, LocationFeatureSpecification (amenities), GeoCoordinates, licence credential issued by a GovernmentOrganization, City/AdministrativeArea for area served, ContactPoint.

## Notable features
- Click-to-call in the header and hero, enquiry form (name, phone, optional email, type of stay, mobility, message, consent, honeypot field).
- Click-to-load Google Map (map loads only after "Prikaži mapu", privacy-friendly).
- Photo gallery with lightbox on /smestaj/, FAQ accordions on home and /usluge/, breadcrumbs on inner pages, privacy policy page.

## Pages shot
- family-garden-home.webp — https://family-garden.rs/ (hero)
- family-garden-care.webp — https://family-garden.rs/usluge/ section "Medicinska nega i pomoć 24 sata."
- family-garden-rooms.webp — https://family-garden.rs/smestaj/ section "Izaberite sobu po meri."
- family-garden-contact.webp — https://family-garden.rs/kontakt/ section "Pošaljite upit" (empty form)
