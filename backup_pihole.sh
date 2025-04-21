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