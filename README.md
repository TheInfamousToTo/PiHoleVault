# Pi-hole Backup Script

This script creates backups of your Pi-hole configuration using the Teleporter function and stores them in a specified directory. It also manages old backups, keeping only a configurable number of the most recent backups.

## Features
- Automated Pi-hole configuration backups using Teleporter.
- Configurable backup directory.
- Timestamped backup files in `.zip` format.
- Automatic removal of old backups, keeping only the most recent backups.

## Prerequisites
- Pi-hole installed and running (version 5.x or 6.x).
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

You'll need to adjust these variables within the `backup_pihole.sh` script to match your preferences:

- **`BACKUP_DIR`**: Define the full path to the directory where you want Pi-hole backups to be saved. The default is `/mnt/nfs/BACKUP/Pihole`, which assumes you are using an NFS mount at that location. **Be sure to change this if your backup location is different.**

- **`MAX_BACKUPS`**: Specify the maximum number of the most recent backup files you want to keep. Older backups beyond this limit will be automatically removed during each script execution. The default is `10`.

## Script Details
```bash
#!/bin/bash

# ------------------------------------------------------------------------------
# Script: backup_pihole.sh
# Author: TheInfamousToTo
# Date: April 21, 2025
# Description: This script automates the backup of Pi-hole configurations
#              using the Teleporter function, stores them in a specified
#              directory, and manages old backups.
# ------------------------------------------------------------------------------

# ---------------------------- Configuration ---------------------------------
# Define the directory where Pi-hole backups will be stored.
# Default is set to an NFS mount point. CHANGE THIS if needed.
BACKUP_DIR="/mnt/nfs/BACKUP/Pihole"

# Define the maximum number of backup files to keep.
# Older backups exceeding this number will be automatically removed.
MAX_BACKUPS=10
# ------------------------------------------------------------------------------

# Ensure the backup directory exists. The '-p' flag creates parent
# directories if they don't exist without throwing an error.
mkdir -p "$BACKUP_DIR"

# Create Pi-hole backup
echo "Creating Pi-hole backup..."
pihole -a -t "$BACKUP_DIR/$BACKUP_FILE"

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup created successfully: $BACKUP_DIR/$BACKUP_FILE"
else
    echo "Backup failed!"
    exit 1
fi

# If the script reaches this point, the backup and cleanup process
# were likely successful. Exit with a zero exit code.
echo "Pi-hole backup script finished."
exit 0

# ----------------------------- Important Notes -----------------------------
# *** IMPORTANT: To automate this script, you need to set up a cron job.
# *** Example (runs every day at 3:00 AM - adjust as needed):
# *** 0 3 * * * /path/to/script/backup_pihole.sh
# *** Replace '/path/to/script/backup_pihole.sh' with the actual path to
# *** where you saved the script. Use `sudo crontab -e` to edit the root
# *** crontab for system-wide scheduling.

# *** Test the script thoroughly by running it manually first to ensure it
# *** works as expected and that backups are created and old ones are removed.

# *** Always verify that the backup files are valid and can be used for
# *** restoration if needed.

# *** Ensure that the script has the necessary permissions to write to the
# *** specified backup directory and to execute the `pihole-FTL` command.
# --------------------------------------------------------------------------
```

## License
This project is licensed under the MIT License.

Feel free to modify the sections according to your specific needs.
