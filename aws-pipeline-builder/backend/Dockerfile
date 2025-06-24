FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .
COPY dynamodb_storage.py .
COPY lock_manager.py .
COPY pipeline_settings.json .
COPY env_suggestions.json .
COPY pipeline_metadata.json .
COPY manifest_template.yml .

# Create config directory
RUN mkdir -p /app/config

# Expose port
EXPOSE 5000

# Set environment variable for config path
ENV CONFIG_PATH=/app/config/appsettings.json

# Run the application
CMD ["python", "app.py"]