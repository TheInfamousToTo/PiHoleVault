#!/bin/bash

# PiHoleVault Debug Setup Script
# This script helps set up and manage debug mode for PiHoleVault

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_header() {
    echo -e "${BLUE}=================================${NC}"
    echo -e "${BLUE}  PiHoleVault Debug Setup${NC}"
    echo -e "${BLUE}=================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

show_help() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start       Start PiHoleVault in debug mode"
    echo "  stop        Stop debug containers"
    echo "  restart     Restart debug containers"
    echo "  logs        Show live logs"
    echo "  build       Build debug image"
    echo "  status      Show debug status"
    echo "  health      Check health endpoints"
    echo "  debug-api   Test debug API endpoints"
    echo "  cleanup     Clean up debug files and containers"
    echo "  shell       Access container shell"
    echo "  help        Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  DEBUG_MODE=true|false     Enable/disable debug mode (default: true)"
    echo "  LOG_LEVEL=debug|info      Set logging level (default: debug)"
    echo "  DEBUG_LEVEL=debug|info    Set debug logging level (default: debug)"
}

check_dependencies() {
    print_info "Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        print_warning "curl is not installed - some features may not work"
    fi
    
    print_success "Dependencies check completed"
}

setup_directories() {
    print_info "Setting up debug directories..."
    
    mkdir -p "${SCRIPT_DIR}/data"
    mkdir -p "${SCRIPT_DIR}/backups"
    mkdir -p "${SCRIPT_DIR}/debug-logs"
    
    print_success "Debug directories created"
}

start_debug() {
    print_info "Starting PiHoleVault in debug mode..."
    
    setup_directories
    
    # Export debug environment variables
    export DEBUG_MODE=true
    export LOG_LEVEL=debug
    export DEBUG_LEVEL=debug
    
    # Start with debug compose file
    docker-compose -f "${SCRIPT_DIR}/docker-compose.debug.yml" up -d
    
    print_success "PiHoleVault started in debug mode"
    print_info "Container: piholevault-debug"
    print_info "Web Interface: http://localhost:3000"
    print_info "Debug API: http://localhost:3000/api/debug"
    
    # Wait for container to be ready
    print_info "Waiting for container to be ready..."
    sleep 10
    
    if check_health_quiet; then
        print_success "Container is healthy and ready"
        show_debug_endpoints
    else
        print_warning "Container may still be starting up. Check logs with: $0 logs"
    fi
}

stop_debug() {
    print_info "Stopping debug containers..."
    docker-compose -f "${SCRIPT_DIR}/docker-compose.debug.yml" down
    print_success "Debug containers stopped"
}

restart_debug() {
    print_info "Restarting debug containers..."
    stop_debug
    sleep 2
    start_debug
}

show_logs() {
    print_info "Showing live logs (Ctrl+C to exit)..."
    docker-compose -f "${SCRIPT_DIR}/docker-compose.debug.yml" logs -f
}

build_debug() {
    print_info "Building debug image..."
    docker build -t theinfamoustoto/piholevault:debug "${SCRIPT_DIR}"
    print_success "Debug image built successfully"
}

show_status() {
    print_info "Debug Status:"
    echo ""
    
    # Container status
    if docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -q piholevault-debug; then
        print_success "Container is running"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep piholevault-debug
    else
        print_warning "Container is not running"
    fi
    
    echo ""
    
    # Health check
    if check_health_quiet; then
        print_success "Health check: PASS"
    else
        print_warning "Health check: FAIL"
    fi
    
    # Debug endpoints
    show_debug_endpoints
}

check_health_quiet() {
    curl -s -f http://localhost:3000/health > /dev/null 2>&1
    return $?
}

check_health() {
    print_info "Checking health endpoints..."
    
    if curl -s -f http://localhost:3000/health > /dev/null; then
        print_success "Main health endpoint: OK"
        
        # Get detailed health info
        health_data=$(curl -s http://localhost:3000/health | jq -r '.')
        echo "Health Data:"
        echo "$health_data" | jq '.'
    else
        print_error "Main health endpoint: FAIL"
        return 1
    fi
    
    if curl -s -f http://localhost:3000/api/debug/status > /dev/null; then
        print_success "Debug status endpoint: OK"
    else
        print_warning "Debug status endpoint: Not available"
    fi
}

show_debug_endpoints() {
    echo ""
    print_info "Available Debug Endpoints:"
    echo "  - http://localhost:3000/api/debug/status"
    echo "  - http://localhost:3000/api/debug/system-info"
    echo "  - http://localhost:3000/api/debug/health-check"
    echo "  - http://localhost:3000/api/debug/logs"
    echo "  - http://localhost:3000/api/debug/log-analysis"
    echo "  - http://localhost:3000/api/debug/report"
    echo "  - http://localhost:3000/api/debug/files"
    echo "  - http://localhost:3000/api/debug/environment"
}

test_debug_api() {
    print_info "Testing debug API endpoints..."
    
    # Test status endpoint
    echo ""
    print_info "Testing /api/debug/status..."
    if response=$(curl -s http://localhost:3000/api/debug/status); then
        print_success "Status endpoint responded"
        echo "$response" | jq '.'
    else
        print_error "Status endpoint failed"
    fi
    
    # Test health check endpoint
    echo ""
    print_info "Testing /api/debug/health-check..."
    if response=$(curl -s http://localhost:3000/api/debug/health-check); then
        print_success "Health check endpoint responded"
        echo "$response" | jq '.data.directories'
    else
        print_error "Health check endpoint failed"
    fi
    
    # Test system info endpoint
    echo ""
    print_info "Testing /api/debug/system-info..."
    if response=$(curl -s http://localhost:3000/api/debug/system-info); then
        print_success "System info endpoint responded"
        echo "$response" | jq '.data.node'
    else
        print_error "System info endpoint failed"
    fi
}

cleanup_debug() {
    print_info "Cleaning up debug resources..."
    
    # Stop containers
    docker-compose -f "${SCRIPT_DIR}/docker-compose.debug.yml" down --volumes
    
    # Remove debug image
    if docker images | grep -q "theinfamoustoto/piholevault.*debug"; then
        docker rmi theinfamoustoto/piholevault:debug 2>/dev/null || true
    fi
    
    # Clean up debug logs (with confirmation)
    if [ -d "${SCRIPT_DIR}/debug-logs" ]; then
        echo ""
        read -p "Remove debug logs directory? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "${SCRIPT_DIR}/debug-logs"
            print_success "Debug logs removed"
        fi
    fi
    
    print_success "Debug cleanup completed"
}

container_shell() {
    print_info "Accessing container shell..."
    if docker ps | grep -q piholevault-debug; then
        docker exec -it piholevault-debug /bin/sh
    else
        print_error "Debug container is not running. Start it first with: $0 start"
        exit 1
    fi
}

main() {
    print_header
    
    case "${1:-help}" in
        start)
            check_dependencies
            start_debug
            ;;
        stop)
            stop_debug
            ;;
        restart)
            restart_debug
            ;;
        logs)
            show_logs
            ;;
        build)
            check_dependencies
            build_debug
            ;;
        status)
            show_status
            ;;
        health)
            check_health
            ;;
        debug-api)
            test_debug_api
            ;;
        cleanup)
            cleanup_debug
            ;;
        shell)
            container_shell
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Check if jq is available (for JSON formatting)
if ! command -v jq &> /dev/null; then
    print_warning "jq is not installed - JSON output will not be formatted"
    # Create a simple jq replacement
    jq() {
        if [ "$1" = "." ]; then
            cat
        else
            cat
        fi
    }
fi

main "$@"
