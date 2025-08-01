#!/bin/bash

# Legacy Docker Build Script - DEPRECATED
# 
# ⚠️  WARNING: This script is deprecated!
# 
# 📝 NEW RECOMMENDED WORKFLOW:
#   1. Push changes to Git: git push origin main
#   2. GitHub Actions automatically builds and pushes multi-arch images
#   3. For local testing: ./build-multiarch.sh build
#
# 🔗 See: .github/workflows/docker-build.yml
# 🛠️  For local builds: ./build-multiarch.sh

echo "⚠️  DEPRECATED: This script is no longer maintained"
echo ""
echo "📝 Use the new workflow instead:"
echo "  1. git push origin main  # Automatic CI/CD"
echo "  2. ./build-multiarch.sh  # Local development"
echo ""
echo "🚀 The new workflow supports multi-architecture builds:"
echo "  - AMD64 (Intel/AMD)"
echo "  - ARM64 (Raspberry Pi 4, Apple Silicon)"
echo "  - ARMv7 (Raspberry Pi 3)"
echo ""

exit 1
