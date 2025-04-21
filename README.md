# Pi-hole-Backup-Script

This script creates backups of your Pi-hole configuration and stores them in a specified directory. It also manages old backups, keeping only a configurable number of the most recent backups.

## Features
- Automated Pi-hole configuration backups.
- Configurable backup directory.
- Timestamped backup files.
- Automatic removal of old backups, keeping only the most recent backups.

## Prerequisites
- Pi-hole installed and running.
- Sufficient permissions to execute backup commands and write to the backup directory.

## Usage
1. Clone the repository:
   ```sh
   git clone https://github.com/TheInfamousToTo/Pi-hole-Backup-Script.git
   ```
2. Navigate to the script directory:
   ```sh
   cd Pi-hole-Backup-Script
   ```
3. Make the script executable:
   ```sh
   chmod +x backup_pihole.sh
   ```
4. Execute the script:
   ```sh
   ./pihole-backup.sh
   ```

## Configuration
- `BACKUP_DIR`: The directory where backups will be stored. Default is `/mnt/nfs/BACKUP/Pihole`.
- `MAX_BACKUPS`: The maximum number of backups to keep. Default is 10.

## Script Details
```bash
#!/bin/bash

# Variables
BACKUP_DIR="/mnt/nfs/BACKUP/Pihole"  # *** CHANGE THIS to your desired backup directory ***
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="pihole_backup_$TIMESTAMP.tar.gz"
SCRIPT_DIR="/path/to/script/pihole-backup" # *** Usually no need to change this, but it's good to define it ***
MAX_BACKUPS=10  # *** CHANGE THIS to the number of backups you want to keep ***

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create Pi-hole backup
echo "Creating Pi-hole backup..."
pihole -t "$BACKUP_DIR/$BACKUP_FILE"

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup created successfully: $BACKUP_DIR/$BACKUP_FILE"
else
    echo "Backup failed!"
    exit 1
fi

# Remove old backups
echo "Removing old backups (keeping the last $MAX_BACKUPS)..."
find "$BACKUP_DIR" -name "pihole_backup_*.tar.gz" -type f | sort -r | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f

echo "Backup process completed!"

# *** IMPORTANT: Set up a cron job to run this script automatically.  Example (every 2 days at 2:00 AM):
# *** 0 2 */2 * * /path/to/script/backup_pihole.sh  (Adjust path if needed)
# *** Use `sudo crontab -e` to edit the root crontab.

# *** Test the script thoroughly! Run it manually first to make sure it's working as expected. ***
# *** Check the backups to ensure they are valid. ***
# *** Make sure the script has the correct permissions to write to the backup directory and run the `pihole` command. ***
```

## License
This project is licensed under the MIT License.

Feel free to modify the sections according to your specific needs.
