FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home tanpoosh
COPY backend/ .
COPY frontend/public/studio-images/manifest.json /app/frontend/public/studio-images/manifest.json
RUN mkdir -p media staticfiles .local-credentials && chown -R tanpoosh:tanpoosh /app
USER tanpoosh
EXPOSE 8000
CMD ["sh", "-c", "python manage.py collectstatic --noinput && exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 90 --access-logfile -"]
