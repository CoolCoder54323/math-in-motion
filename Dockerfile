# ---- Base stage with system dependencies ----
FROM python:3.11-slim AS base

# Install system deps: ffmpeg, cairo, pango, texlive, nodejs
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libcairo2-dev \
    libpango1.0-dev \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-xetex \
    ca-certificates \
    curl \
    gnupg \
    build-essential \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Python deps ----
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ---- Node deps ----
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
COPY . .
RUN npm run build

# ---- Runtime ----
ENV NODE_ENV=production
ENV PORT=3000
ENV MANIM_MEDIA_ROOT=/app/.manim-output

EXPOSE 3000

CMD ["npm", "start"]
