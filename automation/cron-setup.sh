#!/bin/bash

# ALCHEMY Token Distributor - Cron Setup Script
# This script helps you set up automated distributions using cron

echo "================================"
echo "ALCHEMY Token Distributor"
echo "Cron Job Setup"
echo "================================"
echo ""

# Get the current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Project directory: $PROJECT_DIR"
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Menu for cron schedule selection
echo "Select distribution schedule:"
echo "1) Every day at midnight (0 0 * * *)"
echo "2) Every Monday at 9 AM (0 9 * * 1)"
echo "3) Every hour (0 * * * *)"
echo "4) Every 6 hours (0 */6 * * *)"
echo "5) Custom schedule"
echo ""

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        CRON_SCHEDULE="0 0 * * *"
        DESCRIPTION="Daily at midnight"
        ;;
    2)
        CRON_SCHEDULE="0 9 * * 1"
        DESCRIPTION="Every Monday at 9 AM"
        ;;
    3)
        CRON_SCHEDULE="0 * * * *"
        DESCRIPTION="Every hour"
        ;;
    4)
        CRON_SCHEDULE="0 */6 * * *"
        DESCRIPTION="Every 6 hours"
        ;;
    5)
        read -p "Enter custom cron schedule (e.g., '0 0 * * *'): " CRON_SCHEDULE
        DESCRIPTION="Custom schedule"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "Selected schedule: $DESCRIPTION"
echo "Cron pattern: $CRON_SCHEDULE"
echo ""

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

# Generate cron command
CRON_COMMAND="$CRON_SCHEDULE cd $PROJECT_DIR && /usr/bin/node dist/distribute-tokens.js >> logs/distribution.log 2>&1"

echo "The following line will be added to your crontab:"
echo ""
echo "$CRON_COMMAND"
echo ""

read -p "Do you want to add this to your crontab? (y/n): " confirm

if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    # Backup current crontab
    crontab -l > /tmp/crontab.backup 2>/dev/null || true
    
    # Add new cron job
    (crontab -l 2>/dev/null || true; echo "$CRON_COMMAND") | crontab -
    
    echo ""
    echo "✅ Cron job added successfully!"
    echo ""
    echo "To view your cron jobs: crontab -l"
    echo "To edit your cron jobs: crontab -e"
    echo "To remove this cron job: crontab -e and delete the line"
    echo ""
    echo "Logs will be saved to: $PROJECT_DIR/logs/distribution.log"
else
    echo ""
    echo "❌ Cron job not added. You can manually add it using: crontab -e"
fi
