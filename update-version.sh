#!/bin/bash

# PiHoleVault Version Management Script
# Updates version across all files and triggers release workflow

set -e

# Function to show usage
show_usage() {
    echo "Usage: $0 [VERSION]"
    echo ""
    echo "Updates version across all PiHoleVault files and creates a release."
    echo ""
    echo "Arguments:"
    echo "  VERSION     New version (e.g., 1.5.1, 1.6.0, 2.0.0)"
    echo "              Will be automatically prefixed with 'v' for git tags"
    echo ""
    echo "Examples:"
    echo "  $0 1.5.1    # Update to version v1.5.1"
    echo "  $0 1.6.0    # Update to version v1.6.0"
    echo "  $0 2.0.0    # Update to version v2.0.0"
    echo ""
    echo "What this script does:"
    echo "  1. Updates version file"
    echo "  2. Updates package.json files"
    echo "  3. Updates README.md version references"
    echo "  4. Commits changes"
    echo "  5. Pushes to GitHub (triggers automatic release)"
    echo ""
}

# Validate version format
validate_version() {
    local version="$1"
    if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "❌ Invalid version format: $version"
        echo "   Expected format: X.Y.Z (e.g., 1.5.1)"
        exit 1
    fi
}

# Update version in file
update_version_file() {
    local new_version="$1"
    local file="$2"
    local pattern="$3"
    local replacement="$4"
    
    if [[ -f "$file" ]]; then
        if grep -q "$pattern" "$file"; then
            sed -i "s|$pattern|$replacement|g" "$file"
            echo "✅ Updated $file"
        else
            echo "⚠️  Pattern not found in $file: $pattern"
        fi
    else
        echo "⚠️  File not found: $file"
    fi
}

# Main script
if [[ "$1" == "--help" || "$1" == "-h" || -z "$1" ]]; then
    show_usage
    exit 0
fi

NEW_VERSION="$1"
NEW_VERSION_TAG="v$NEW_VERSION"

# Validate version format
validate_version "$NEW_VERSION"

# Get current version
CURRENT_VERSION=$(cat version 2>/dev/null || echo "unknown")

echo "🚀 PiHoleVault Version Update Script"
echo "===================================="
echo "📦 Current version: $CURRENT_VERSION"
echo "📦 New version: $NEW_VERSION_TAG"
echo ""

# Confirm update
read -p "Continue with version update? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Version update cancelled."
    exit 1
fi

echo ""
echo "🔄 Updating version files..."

# Update main version file
echo "$NEW_VERSION_TAG" > version
echo "✅ Updated version file"

# Update package.json files
update_version_file "$NEW_VERSION" "backend/package.json" '"version": "[^"]*"' "\"version\": \"$NEW_VERSION\""
update_version_file "$NEW_VERSION" "frontend/package.json" '"version": "[^"]*"' "\"version\": \"$NEW_VERSION\""

# Update README.md
update_version_file "$NEW_VERSION_TAG" "README.md" "# PiHoleVault v[0-9]\+\.[0-9]\+\.[0-9]\+" "# PiHoleVault $NEW_VERSION_TAG"
update_version_file "$NEW_VERSION_TAG" "README.md" "\*\*Latest Release\*\*: \[v[0-9]\+\.[0-9]\+\.[0-9]\+\]" "**Latest Release**: [$NEW_VERSION_TAG]"
update_version_file "$NEW_VERSION_TAG" "README.md" "releases/tag/v[0-9]\+\.[0-9]\+\.[0-9]\+" "releases/tag/$NEW_VERSION_TAG"

echo ""
echo "📝 Committing changes..."

# Check if there are changes to commit
if git diff --quiet; then
    echo "⚠️  No changes detected. Version might already be up to date."
    exit 1
fi

# Configure git (if not already configured)
if [[ -z "$(git config user.name)" ]]; then
    git config user.name "Version Update Script"
fi
if [[ -z "$(git config user.email)" ]]; then
    git config user.email "noreply@piholevault.com"
fi

# Stage and commit changes
git add version backend/package.json frontend/package.json README.md
git commit -m "bump: update version to $NEW_VERSION_TAG

- Updated version file to $NEW_VERSION_TAG
- Updated package.json files to $NEW_VERSION
- Updated README.md version references

This commit will trigger the automated release workflow."

echo "✅ Changes committed"

echo ""
echo "🚀 Pushing to GitHub..."

# Push changes
git push origin main

echo "✅ Changes pushed to GitHub"
echo ""
echo "🎉 Version update complete!"
echo "📋 What happens next:"
echo "   1. GitHub Actions will detect the version file change"
echo "   2. A new release will be automatically created: $NEW_VERSION_TAG"
echo "   3. Multi-architecture Docker images will be built and pushed"
echo "   4. Release notes will be generated and published"
echo ""
echo "🔗 Monitor progress at: https://github.com/TheInfamousToTo/PiHoleVault/actions"
echo "🏷️  Release will be available at: https://github.com/TheInfamousToTo/PiHoleVault/releases/tag/$NEW_VERSION_TAG"
