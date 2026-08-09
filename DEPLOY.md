# UniTech PM — Deploy Runbook (Azərbaycanca)

> Bu sənəd **sənin girişini tələb edən** iki addımı tam izah edir:
> **A hissə** — Docker stack-i öz Mac-ində runtime yoxlamaq (yüngül, ~15 dəq).
> **B hissə** — DigitalOcean droplet-ə production deploy (HTTPS ilə).
> Kod tərəfi (Postgres, Docker faylları, təhlükəsizlik başlıqları, rate limiting) artıq HAZIRDIR — bax `ROADMAP.md §5c`. Bu addımlar avtomatlaşdırıla bilmədi, çünki (A) bu iş mühitində Docker daemon söndürülüb və qigabaytlarla model çəkilir, (B) sənin DigitalOcean hesabına/serverinə giriş lazımdır.

---

## ⚠️ Production-a çıxmazdan əvvəl MÜTLƏQ
- **Demo şifrələrini dəyiş.** Seed hər kəsə `demo1234` verir. Production-da `owner@unitech.az` şifrəsini dəyiş (və ya real istifadəçilər yarat). Şifrəsiz production = açıq qapı.
- **`AUTH_SECRET` güclü olsun:** `openssl rand -base64 48` ilə generasiya et, `.env.docker`-ə yaz.
- **`.env.docker`-i heç vaxt commit etmə** (`.gitignore` onu artıq istisna edir). Faylın icazəsi: `chmod 600 .env.docker`.

---

## A hissə — Docker stack-i lokal yoxlamaq (öz Mac-ində)

### A1. Docker Desktop-u işə sal
- Applications → **Docker** (artıq quraşdırılıb: `/Applications/Docker.app`).
- Menyu barındakı balina ikonu **"running"** olana qədər gözlə (~30 san).
- Yoxla:
```bash
docker info
```
Xəta versə, Docker hələ qalxmayıb — bir az gözlə.

### A2. `.env.docker` faylını hazırla
```bash
cd "/Users/samirnbiyev/Desktop/PM AI Assistant"
cp .env.docker.example .env.docker
openssl rand -base64 48          # çıxan dəyəri kopyala
```
`.env.docker`-i aç, `AUTH_SECRET=`-ə həmin dəyəri yapışdır. (Lokal test üçün `POSTGRES_PASSWORD` və `DOMAIN=localhost` olduğu kimi qala bilər.)

### A3. Stack-i qaldır
```bash
docker compose --env-file .env.docker up -d --build
```
- **İlk dəfə uzun çəkir** (~5–10 dəq): image build olunur + `node:24-bookworm-slim` bazası çəkilir.
- **Modellər avtomatik çəkilir** (`ollama-init` servisi): `qwen2.5:7b` **~4.7 GB** + `nomic-embed-text` ~274 MB. Bu bir neçə dəqiqədir. İzlə:
```bash
docker compose --env-file .env.docker logs -f ollama-init
```
- **Migration-lar avtomatik tətbiq olunur** (`migrate` servisi app-dan əvvəl işləyir).

### A4. Demo data əlavə et (bir dəfə)
```bash
docker compose --env-file .env.docker run --rm migrate npm run db:seed
```

### A5. Yoxla
- Brauzerdə: **http://localhost:3000**
- Giriş: `owner@unitech.az` / `demo1234`
- Servislərin vəziyyəti:
```bash
docker compose --env-file .env.docker ps        # hamısı Up/healthy olmalı
docker compose --env-file .env.docker logs app   # app logları
```

### A6. Dayandır / təmizlə
```bash
docker compose --env-file .env.docker down      # dayandır (data volume-larda qalır)
docker compose --env-file .env.docker down -v   # data ilə birlikdə tam sil
```

---

## B hissə — DigitalOcean droplet-ə production deploy

**Lazımdır:** DigitalOcean hesabı ($200 kredit), (tövsiyə olunur) bir domain adı.

### B1. Droplet yarat
DigitalOcean panel → **Create → Droplets**:
- **Region:** sənə yaxın (məs. Frankfurt / Amsterdam).
- **Image:** Ubuntu **24.04 LTS**.
- **Size:** 7B model CPU-da RAM istəyir. **Minimum: 8 GB RAM / 4 vCPU.** Rahatlıq üçün **16 GB RAM**. **Disk ən azı 60–80 GB SSD** (modellər + image-lər + Postgres). $200 kredit bunu bir neçə ay saxlayır.
- **Authentication:** **SSH key** (tövsiyə) — açarını əlavə et. (Yoxdursa: `ssh-keygen -t ed25519` lokal, sonra public açarı yapışdır.)
- **Hostname:** `unitech-pm`.
- **Create Droplet** → IP ünvanını qeyd et.

### B2. Serveri ilkin quraşdır (SSH ilə)
```bash
ssh root@DROPLET_IP
apt update && apt upgrade -y

# non-root istifadəçi
adduser samir
usermod -aG sudo samir

# firewall — YALNIZ SSH + HTTP + HTTPS
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# (RAM 8GB-dırsa faydalı) 4GB swap
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### B3. Docker quraşdır
```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker samir
```
Sonra `exit` edib `ssh samir@DROPLET_IP` ilə yenidən gir (docker qrupu aktiv olsun).

### B4. Kodu droplet-ə köçür
Repo hələ git deyil, ona görə ən sadəsi **rsync** (lokal Mac-dən işlət):
```bash
rsync -avz --exclude node_modules --exclude .next --exclude .git \
  --exclude uploads --exclude backups --exclude .env --exclude '.env.docker' \
  -e ssh "/Users/samirnbiyev/Desktop/PM AI Assistant/" samir@DROPLET_IP:~/unitech-pm/
```
> Alternativ: layihəni private GitHub repo-ya push et (`git init` + push), sonra droplet-də `git clone`. Uzunmüddətli üçün bu daha yaxşıdır.

### B5. Droplet-də `.env.docker` yarat
```bash
ssh samir@DROPLET_IP
cd ~/unitech-pm
cp .env.docker.example .env.docker
nano .env.docker
```
Doldur:
- `AUTH_SECRET=` → `openssl rand -base64 48` çıxışı,
- `POSTGRES_PASSWORD=` → güclü şifrə,
- `DOMAIN=pm.senin-domenin.az` (domain varsa; yoxdursa `localhost` qalsın, amma onda avtomatik HTTPS olmaz — bax B6 qeydi).
```bash
chmod 600 .env.docker
```

### B6. DNS (domain varsa)
Domain provider-ində **A record**: `pm.senin-domenin.az → DROPLET_IP`. Yayılması ~5–30 dəq. Yoxla:
```bash
dig +short pm.senin-domenin.az    # DROPLET_IP göstərməli
```
> **Domain yoxdursa:** Caddy bare IP üçün Let's Encrypt sertifikatı ala bilmir. Ya bir domain al (ən ucuz yol), ya da müvəqqəti olaraq A hissəsindəki kimi HTTP (Caddy-siz) işlət.

### B7. Production stack-i qaldır (Caddy + HTTPS)
```bash
cd ~/unitech-pm
docker compose --env-file .env.docker -f compose.yaml -f compose.prod.yaml up -d --build
# modellər çəkilir (izlə):
docker compose --env-file .env.docker logs -f ollama-init
# demo/başlanğıc data (bir dəfə):
docker compose --env-file .env.docker run --rm migrate npm run db:seed
```
Caddy `DOMAIN` üçün Let's Encrypt TLS sertifikatını **avtomatik** alır.

### B8. Yoxla
- **https://pm.senin-domenin.az** aç → yaşıl kilid (etibarlı TLS).
- Giriş → **owner şifrəsini DƏYİŞ** (bax yuxarıdakı ⚠️).

---

## C hissə — Deploy sonrası

### C1. Avtomatik yedəkləmə (cron)
Production-da Postgres konteynerdədir, ona görə `pg_dump`-ı konteynerdən çağır. `crontab -e`:
```
# hər gecə 03:00 — DB yedəyi
0 3 * * * cd ~/unitech-pm && docker compose --env-file .env.docker exec -T postgres pg_dump -U unitech --no-owner --no-privileges unitech_pm | gzip > ~/unitech-pm/backups/db_$(date +\%F).sql.gz
```
> `scripts/backup.sh` host-da pg_dump istəyir (lokal dev üçün); production/Docker üçün yuxarıdakı konteyner-əsaslı sətir işlədilir.

### C2. Kodu yeniləmək
```bash
# lokal Mac-dən yenidən rsync (B4), sonra droplet-də:
docker compose --env-file .env.docker -f compose.yaml -f compose.prod.yaml up -d --build
```
Migration-lar `migrate` servisi ilə avtomatik tətbiq olunur.

### C3. Monitorinq
```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f app
docker stats            # RAM/CPU (7B model RAM-ını izlə)
```

### C4. Daha güclü model (14B) / GPU
- Yaxşı AZ dili üçün `.env.docker`-də `OLLAMA_MODEL=qwen2.5:14b` (daha çox RAM/GPU tələb edir).
- **GPU serverdə:** `ollama` servisinə GPU verilməlidir. `compose.prod.yaml`-də `ollama`-ya əlavə et:
```yaml
  ollama:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```
(NVIDIA Container Toolkit host-da quraşdırılmalıdır.)

---

## Nasazlıqların aradan qaldırılması
| Simptom | Yoxla |
|---|---|
| Caddy TLS almır | DNS A record düzdürmü (`dig`), 80/443 açıqdırmı (`ufw status`), `DOMAIN` düzdürmü, `docker compose logs caddy` |
| App qalxmır | `docker compose logs app`; migration: `docker compose logs migrate` |
| AI cavab vermir | `docker compose logs ollama`; modellər çəkilibmi: `docker compose exec ollama ollama list` |
| Model çəkilmir | `docker compose logs ollama-init`; disk yeri: `df -h` |
| Ollama çox yavaş | CPU-da 7B yavaşdır → daha çox vCPU və ya GPU (C4) |
| Giriş alınmır | seed işləyibmi (`run --rm migrate npm run db:seed`); şifrə `demo1234` (dəyişməyibsə) |

---

**Fayl arayışı:** `Dockerfile`, `compose.yaml` (base), `compose.prod.yaml` (Caddy override), `Caddyfile`, `.env.docker.example`, `scripts/backup.sh`. Texniki detal: `ROADMAP.md §5c`.
