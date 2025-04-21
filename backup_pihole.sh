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

# Output a starting message to the console.
echo "Starting Pi-hole backup script..."

# Generate the Pi-hole Teleporter backup. The '--teleporter' command
# creates a .zip archive of the Pi-hole configuration. The output
# (the filename of the created archive) is captured in the
# 'backup_file' variable.
backup_file=$(pihole-FTL --teleporter)

# Check if the backup creation was successful. The '-n' flag checks
# if the string has a non-zero length (i.e., the filename is not empty).
if [ -n "$backup_file" ]; then
  # If the backup was created successfully, inform the user.
  echo "Successfully created backup: $backup_file"

  # Move the generated backup file to the specified backup directory
  # on the NFS share.
  mv "$backup_file" "$BACKUP_DIR/"
  echo "Moved backup to: $BACKUP_DIR"

  # List the files in the backup directory before the cleanup process.
  echo "Listing files before cleanup:"
  ls -l "$BACKUP_DIR"

  # ------------------------- Remove Old Backups -----------------------------
  echo "Removing old backups (keeping the last $MAX_BACKUPS)..."
  # Find files in the backup directory that match the Pi-hole Teleporter
  # filename pattern (*.zip), are regular files ('-type f'), sort them in
  # reverse order (newest first based on filename), skip the first
  # '$MAX_BACKUPS' files (the newest ones), and then delete the remaining
  # older files using 'xargs'. The '-d '\n'' option ensures that filenames
  # with spaces are handled correctly.
  find "$BACKUP_DIR" -name "pi-hole_pihole_teleporter_*.zip" -type f | sort -r | tail -n +$((MAX_BACKUPS + 1)) | xargs -d '\n' rm -f
  echo "Finished cleanup."
  # --------------------------------------------------------------------------

  # List the files in the backup directory after the cleanup process.
  echo "Listing files after cleanup:"
  ls -l "$BACKUP_DIR"
else
  # If the backup creation failed, display an error message and exit
  # the script with a non-zero exit code (indicating an error).
  echo "Error creating Pi-hole teleporter backup."
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