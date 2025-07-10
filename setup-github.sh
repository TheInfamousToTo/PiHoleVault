#!/bin/bash

# Script to set up GitHub repository for HoleSafe

echo "Setting up GitHub repository for HoleSafe..."

# Initialize Git repository if not already initialized
if [ ! -d ".git" ]; then
  git init
  echo "Git repository initialized."
else
  echo "Git repository already exists."
fi

# Add remote
git remote add origin https://github.com/TheInfamousToTo/HoleSafe.git

# Add all files
git add .

# Initial commit
git commit -m "Initial commit of HoleSafe v0.1 - Pi-hole Backup Manager"

echo "Repository is ready to push to GitHub."
echo "Run the following command to push to GitHub:"
echo "git push -u origin main"
