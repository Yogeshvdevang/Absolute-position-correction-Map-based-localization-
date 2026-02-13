FROM node:20-bookworm AS frontend
WORKDIR /frontend
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html ./
COPY public ./public
COPY src ./src
COPY tsconfig*.json ./
COPY vite.config.ts ./
RUN npm run build

FROM python:3.11-slim AS runtime
WORKDIR /app
COPY backend ./backend
COPY --from=frontend /frontend/dist ./frontend/build
RUN pip install --no-cache-dir -r backend/requirements.txt
ENV FRONTEND_DIR=/app/frontend/build
EXPOSE 8000
CMD ["uvicorn", "backend.api:app", "--host", "0.0.0.0", "--port", "8000"]
