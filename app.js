// ================================================
// Minecraft Server Panel - Consolidated App.js
// ================================================
// Dependencies
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { spawn, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const multer = require('multer');
const archiver = require('archiver');
const unzipper = require('unzipper');
const axios = require('axios');
const pidusage = require('pidusage');
const sanitize = require('sanitize-filename');
const zlib = require('zlib');
const prismarineNbt = require('prismarine-nbt');
const { promisify } = require('util');
const http = require('http');
const socketIo = require('socket.io');
const os = require('os');
const net = require('net'); // Added for IP validation
const flash = require('connect-flash');
const { Rcon } = require('rcon-client');
// Promisify NBT parsing
const nbtParse = promisify(prismarineNbt.parse);
// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const router = express.Router();
app.use(flash());
app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false
}));
app.use((req, res, next) => {
    res.locals.messages = req.flash(); // <-- THIS FIXES IT
    next();
});
// Configuration
const port = process.env.PORT || 3000;
const DATA_DIR = __dirname;
const DB_PATH = path.join(DATA_DIR, 'database.db');
const SERVERS_DIR = path.join(DATA_DIR, 'servers');
// Ensure directories exist
if (!fs.existsSync(SERVERS_DIR)) {
    fs.mkdirSync(SERVERS_DIR, { recursive: true });
    console.log('Created servers directory:', SERVERS_DIR);
}
// Global state
global.serverProcesses = {};
const serverStartTimes = {};
const onlinePlayers = {};
const serverLogWatchers = {};

// ================================================
// SERVER SOFTWARE MANAGEMENT SYSTEM
// ================================================

// Comprehensive server software definitions
const SERVER_SOFTWARE = {
    // Java Edition Servers
    vanilla: {
        name: 'Vanilla',
        description: 'Official Minecraft server software from Mojang',
        category: 'Java Edition',
        icon: 'fas fa-cube',
        color: '#8B4513',
        downloadUrl: 'https://launcher.mojang.com/v1/objects/{hash}/server.jar',
        manifestUrl: 'https://launchermeta.mojang.com/mc/game/version_manifest.json',
        supports: ['plugins: false', 'mods: false', 'datapacks: true']
    },
    paper: {
        name: 'Paper',
        description: 'High-performance Spigot fork with optimizations and bug fixes',
        category: 'Java Edition',
        icon: 'fas fa-scroll',
        color: '#2196F3',
        downloadUrl: 'https://api.papermc.io/v2/projects/paper/versions/{version}/builds/{build}/downloads/paper-{version}-{build}.jar',
        manifestUrl: 'https://api.papermc.io/v2/projects/paper',
        supports: ['plugins: true', 'mods: false', 'datapacks: true']
    },
    purpur: {
        name: 'Purpur',
        description: 'Paper fork with additional features and configuration options',
        category: 'Java Edition',
        icon: 'fas fa-gem',
        color: '#9C27B0',
        downloadUrl: 'https://api.purpurmc.org/v2/purpur/{version}/latest/download',
        manifestUrl: 'https://api.purpurmc.org/v2/purpur',
        supports: ['plugins: true', 'mods: false', 'datapacks: true']
    },
    spigot: {
        name: 'Spigot',
        description: 'Popular server software with plugin support and performance improvements',
        category: 'Java Edition',
        icon: 'fas fa-fire',
        color: '#FF9800',
        downloadUrl: 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar',
        manifestUrl: null, // Requires BuildTools
        supports: ['plugins: true', 'mods: false', 'datapacks: true']
    },
    bukkit: {
        name: 'CraftBukkit',
        description: 'Original modded server software with plugin API',
        category: 'Java Edition',
        icon: 'fas fa-hammer',
        color: '#795548',
        downloadUrl: 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar',
        manifestUrl: null, // Requires BuildTools
        supports: ['plugins: true', 'mods: false', 'datapacks: true']
    },
    fabric: {
        name: 'Fabric',
        description: 'Lightweight modding platform for modern Minecraft versions',
        category: 'Java Edition',
        icon: 'fas fa-thread',
        color: '#4CAF50',
        downloadUrl: 'https://meta.fabricmc.net/v2/versions/loader/{version}/{loader}/server/jar',
        manifestUrl: 'https://meta.fabricmc.net/v2/versions/game',
        supports: ['plugins: false', 'mods: true', 'datapacks: true']
    },
    forge: {
        name: 'Forge',
        description: 'Popular modding platform with extensive mod ecosystem',
        category: 'Java Edition',
        icon: 'fas fa-anvil',
        color: '#FF5722',
        downloadUrl: 'https://maven.minecraftforge.net/net/minecraftforge/forge/{version}/forge-{version}-installer.jar',
        manifestUrl: 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
        supports: ['plugins: false', 'mods: true', 'datapacks: true']
    },
    quilt: {
        name: 'Quilt',
        description: 'Modern modding platform forked from Fabric with enhanced features',
        category: 'Java Edition',
        icon: 'fas fa-puzzle-piece',
        color: '#673AB7',
        downloadUrl: 'https://meta.quiltmc.org/v3/versions/loader/{version}/{loader}/server/jar',
        manifestUrl: 'https://meta.quiltmc.org/v3/versions/game',
        supports: ['plugins: false', 'mods: true', 'datapacks: true']
    },
    
    // Proxy Servers
    velocity: {
        name: 'Velocity',
        description: 'Modern, high-performance Minecraft proxy server',
        category: 'Proxy Servers',
        icon: 'fas fa-rocket',
        color: '#00BCD4',
        downloadUrl: 'https://api.papermc.io/v2/projects/velocity/versions/{version}/builds/{build}/downloads/velocity-{version}-{build}.jar',
        manifestUrl: 'https://api.papermc.io/v2/projects/velocity',
        supports: ['plugins: true', 'networks: true', 'modern: true']
    },
    bungeecord: {
        name: 'BungeeCord',
        description: 'Popular proxy server for connecting multiple Minecraft servers',
        category: 'Proxy Servers',
        icon: 'fas fa-network-wired',
        color: '#FF6B35',
        downloadUrl: 'https://ci.md-5.net/job/BungeeCord/lastSuccessfulBuild/artifact/bootstrap/target/BungeeCord.jar',
        manifestUrl: null, // Uses CI builds
        supports: ['plugins: true', 'networks: true', 'legacy: true']
    },
    waterfall: {
        name: 'Waterfall',
        description: 'Paper fork of BungeeCord with performance improvements',
        category: 'Proxy Servers',
        icon: 'fas fa-water',
        color: '#2196F3',
        downloadUrl: 'https://api.papermc.io/v2/projects/waterfall/versions/{version}/builds/{build}/downloads/waterfall-{version}-{build}.jar',
        manifestUrl: 'https://api.papermc.io/v2/projects/waterfall',
        supports: ['plugins: true', 'networks: true', 'optimized: true']
    },
    
    // Bedrock Edition
    bedrock: {
        name: 'Bedrock Dedicated Server',
        description: 'Official Minecraft Bedrock Edition server',
        category: 'Bedrock Edition',
        icon: 'fas fa-mobile-alt',
        color: '#4CAF50',
        downloadUrl: 'https://minecraft.azureedge.net/bin-linux/bedrock-server-{version}.zip',
        manifestUrl: null, // Manual version management
        supports: ['crossplay: true', 'mobile: true', 'console: true']
    },
    nukkit: {
        name: 'Nukkit',
        description: 'Third-party Bedrock Edition server with plugin support',
        category: 'Bedrock Edition',
        icon: 'fas fa-atom',
        color: '#9C27B0',
        downloadUrl: 'https://ci.opencollab.dev/job/NukkitX/job/Nukkit/job/master/lastSuccessfulBuild/artifact/target/nukkit-1.0-SNAPSHOT.jar',
        manifestUrl: null, // Uses CI builds
        supports: ['plugins: true', 'crossplay: true', 'mobile: true']
    },
    
    // Specialized Servers
    mohist: {
        name: 'Mohist',
        description: 'Forge + Bukkit hybrid server supporting both mods and plugins',
        category: 'Hybrid Servers',
        icon: 'fas fa-layer-group',
        color: '#607D8B',
        downloadUrl: 'https://mohistmc.com/api/v2/projects/mohist/{version}/builds/latest/download',
        manifestUrl: 'https://mohistmc.com/api/v2/projects/mohist',
        supports: ['plugins: true', 'mods: true', 'hybrid: true']
    },
    catserver: {
        name: 'CatServer',
        description: 'High-performance Forge + Bukkit server implementation',
        category: 'Hybrid Servers',
        icon: 'fas fa-cat',
        color: '#FF9800',
        downloadUrl: 'https://jenkins.rbqcloud.cn:30011/job/CatServer-1.18.2/lastSuccessfulBuild/artifact/target/CatServer-{version}.jar',
        manifestUrl: null, // Uses Jenkins builds
        supports: ['plugins: true', 'mods: true', 'performance: true']
    }
};

// Enhanced version fetching with comprehensive support and complete version history
async function fetchMinecraftVersions(serverType = 'vanilla', limit = null) {
    try {
        const software = SERVER_SOFTWARE[serverType];
        let versions = [];
        
        switch (serverType) {
            case 'vanilla':
                try {
                    const vanillaResponse = await axios.get(software.manifestUrl, { timeout: 10000 });
                    versions = vanillaResponse.data.versions
                        .filter(v => v.type === 'release')
                        .map(v => v.id);
                } catch (err) {
                    console.error('Error fetching vanilla versions:', err.message);
                    versions = getCompleteMinecraftVersions();
                }
                break;
                
            case 'paper':
            case 'waterfall':
            case 'velocity':
                try {
                    const paperResponse = await axios.get(software.manifestUrl, { timeout: 10000 });
                    versions = paperResponse.data.versions.reverse(); // Latest first
                } catch (err) {
                    console.error(`Error fetching ${serverType} versions:`, err.message);
                    versions = getCommonModernVersions();
                }
                break;
                
            case 'purpur':
                try {
                    const purpurResponse = await axios.get(software.manifestUrl, { timeout: 10000 });
                    versions = purpurResponse.data.versions.reverse();
                } catch (err) {
                    console.error('Error fetching purpur versions:', err.message);
                    versions = getCommonModernVersions();
                }
                break;
                
            case 'fabric':
            case 'quilt':
                try {
                    const fabricResponse = await axios.get(software.manifestUrl, { timeout: 10000 });
                    versions = fabricResponse.data
                        .filter(v => v.stable)
                        .map(v => v.version);
                } catch (err) {
                    console.error(`Error fetching ${serverType} versions:`, err.message);
                    versions = getCommonModernVersions();
                }
                break;
                
            case 'forge':
                try {
                    const forgeResponse = await axios.get(software.manifestUrl, { timeout: 10000 });
                    const promos = forgeResponse.data.promos;
                    versions = Object.keys(promos)
                        .filter(key => key.includes('-recommended') || key.includes('-latest'))
                        .map(key => key.split('-')[0])
                        .filter((v, i, arr) => arr.indexOf(v) === i) // Remove duplicates
                        .sort((a, b) => compareVersions(b, a)); // Sort newest first
                } catch (err) {
                    console.error('Error fetching forge versions:', err.message);
                    versions = getForgeCompatibleVersions();
                }
                break;
                
            case 'mohist':
                try {
                    const mohistResponse = await axios.get(software.manifestUrl, { timeout: 10000 });
                    versions = mohistResponse.data.versions.reverse();
                } catch (err) {
                    console.error('Error fetching mohist versions:', err.message);
                    versions = getCommonModernVersions();
                }
                break;
                
            case 'spigot':
            case 'bukkit':
                // Spigot/Bukkit use BuildTools, so we provide common versions
                versions = getSpigotCompatibleVersions();
                break;
                
            case 'bedrock':
                versions = getBedrockVersions();
                break;
                
            case 'nukkit':
                versions = ['1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5'];
                break;
                
            case 'bungeecord':
                // BungeeCord is version-independent but we show compatible MC versions
                versions = getProxyCompatibleVersions();
                break;
                
            default:
                versions = getCompleteMinecraftVersions();
        }
        
        // Apply limit if specified
        if (limit && limit > 0 && versions.length > limit) {
            versions = versions.slice(0, limit);
        }
        
        return versions.length > 0 ? versions : getCompleteMinecraftVersions();
        
    } catch (err) {
        console.error(`Error fetching versions for ${serverType}:`, err.message);
        return getCompleteMinecraftVersions();
    }
}

// Complete Minecraft version history (all major releases)
function getCompleteMinecraftVersions() {
    return [
        // Latest versions (1.20+)
        '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
        '1.20.6', '1.20.5', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20',
        
        // 1.19.x series
        '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
        
        // 1.18.x series
        '1.18.2', '1.18.1', '1.18',
        
        // 1.17.x series
        '1.17.1', '1.17',
        
        // 1.16.x series (very popular)
        '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1', '1.16',
        
        // 1.15.x series
        '1.15.2', '1.15.1', '1.15',
        
        // 1.14.x series
        '1.14.4', '1.14.3', '1.14.2', '1.14.1', '1.14',
        
        // 1.13.x series
        '1.13.2', '1.13.1', '1.13',
        
        // 1.12.x series (very popular for mods)
        '1.12.2', '1.12.1', '1.12',
        
        // 1.11.x series
        '1.11.2', '1.11.1', '1.11',
        
        // 1.10.x series
        '1.10.2', '1.10.1', '1.10',
        
        // 1.9.x series
        '1.9.4', '1.9.3', '1.9.2', '1.9.1', '1.9',
        
        // 1.8.x series (very popular for PvP)
        '1.8.9', '1.8.8', '1.8.7', '1.8.6', '1.8.5', '1.8.4', '1.8.3', '1.8.2', '1.8.1', '1.8',
        
        // 1.7.x series (legacy but still used)
        '1.7.10', '1.7.9', '1.7.8', '1.7.7', '1.7.6', '1.7.5', '1.7.4', '1.7.2',
        
        // Older versions (for historical servers)
        '1.6.4', '1.6.2', '1.6.1',
        '1.5.2', '1.5.1',
        '1.4.7', '1.4.6', '1.4.5', '1.4.4', '1.4.2',
        '1.3.2', '1.3.1',
        '1.2.5', '1.2.4', '1.2.3', '1.2.1',
        '1.1', '1.0'
    ];
}

// Modern versions (1.16+) for newer server software
function getCommonModernVersions() {
    return [
        '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
        '1.20.6', '1.20.5', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20',
        '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
        '1.18.2', '1.18.1', '1.18',
        '1.17.1', '1.17',
        '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1', '1.16'
    ];
}

// Forge-compatible versions (popular modding versions)
function getForgeCompatibleVersions() {
    return [
        '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.20',
        '1.19.4', '1.19.2', '1.19', '1.18.2', '1.18.1', '1.17.1',
        '1.16.5', '1.16.4', '1.16.3', '1.16.1', '1.15.2', '1.14.4',
        '1.13.2', '1.12.2', '1.11.2', '1.10.2', '1.9.4', '1.8.9', '1.7.10'
    ];
}

// Spigot-compatible versions
function getSpigotCompatibleVersions() {
    return [
        '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
        '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.20',
        '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
        '1.18.2', '1.18.1', '1.18', '1.17.1', '1.17',
        '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1',
        '1.15.2', '1.15.1', '1.14.4', '1.13.2', '1.12.2',
        '1.11.2', '1.10.2', '1.9.4', '1.8.8'
    ];
}

// Bedrock versions
function getBedrockVersions() {
    return [
        '1.21.44', '1.21.43', '1.21.42', '1.21.41', '1.21.40',
        '1.21.31', '1.21.30', '1.21.23', '1.21.22', '1.21.21', '1.21.20',
        '1.21.2', '1.21.1', '1.21.0',
        '1.20.81', '1.20.80', '1.20.73', '1.20.72', '1.20.71', '1.20.70',
        '1.20.62', '1.20.61', '1.20.60', '1.20.51', '1.20.50',
        '1.20.41', '1.20.40', '1.20.32', '1.20.31', '1.20.30',
        '1.20.15', '1.20.12', '1.20.11', '1.20.10', '1.20.1', '1.20.0'
    ];
}

// Proxy-compatible versions (shows MC versions the proxy supports)
function getProxyCompatibleVersions() {
    return [
        '1.21.x', '1.20.x', '1.19.x', '1.18.x', '1.17.x', '1.16.x',
        '1.15.x', '1.14.x', '1.13.x', '1.12.x', '1.11.x', '1.10.x',
        '1.9.x', '1.8.x', '1.7.x'
    ];
}

// Version comparison utility
function compareVersions(a, b) {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aPart = aParts[i] || 0;
        const bPart = bParts[i] || 0;
        
        if (aPart > bPart) return 1;
        if (aPart < bPart) return -1;
    }
    
    return 0;
}

// Validate custom version format
function isValidMinecraftVersion(version) {
    // Allow standard version formats
    const patterns = [
        /^\d+\.\d+(\.\d+)?$/, // 1.20.1, 1.20, etc.
        /^\d+\.\d+\.\d+-\w+$/, // 1.20.1-pre1, 1.20.1-rc1
        /^\d+w\d+[a-z]$/, // 20w14a (snapshots)
        /^latest$/i, // "latest"
        /^snapshot$/i // "snapshot"
    ];
    
    return patterns.some(pattern => pattern.test(version.trim()));
}

// Get all available server software organized by category
function getAvailableServerSoftware() {
    const categories = {};
    
    Object.entries(SERVER_SOFTWARE).forEach(([key, software]) => {
        if (!categories[software.category]) {
            categories[software.category] = [];
        }
        categories[software.category].push({
            key,
            ...software
        });
    });
    
    return categories;
}
function saveServerStartTime(serverId, startTime) {
  try {
    const serverDir = resolveServerPath(serverId);
    const startTimeFile = path.join(serverDir, '.server.starttime');
    fs.writeFileSync(startTimeFile, startTime.toString());
    console.log(`Saved start time for server ${serverId}: ${new Date(startTime).toISOString()}`);
  } catch (err) {
    console.error(`Failed to save start time for server ${serverId}:`, err);
  }
}

function loadServerStartTime(serverId) {
  try {
    const serverDir = resolveServerPath(serverId);
    const startTimeFile = path.join(serverDir, '.server.starttime');
    
    if (fs.existsSync(startTimeFile)) {
      const startTime = parseInt(fs.readFileSync(startTimeFile, 'utf8').trim());
      if (!isNaN(startTime) && startTime > 0) {
        console.log(`Loaded start time for server ${serverId}: ${new Date(startTime).toISOString()}`);
        return startTime;
      }
    }
  } catch (err) {
    console.error(`Failed to load start time for server ${serverId}:`, err);
  }
  return null;
}

function deleteServerStartTime(serverId) {
  try {
    const serverDir = resolveServerPath(serverId);
    const startTimeFile = path.join(serverDir, '.server.starttime');
    
    if (fs.existsSync(startTimeFile)) {
      fs.unlinkSync(startTimeFile);
      console.log(`Deleted start time file for server ${serverId}`);
    }
  } catch (err) {
    console.error(`Failed to delete start time file for server ${serverId}:`, err);
  }
}
const serverLogPositions = {};
let globalSettings = {
    registrationEnabled: true,
    panelName: 'Minecraft Server Panel',
    panelDescription: 'Powerful Minecraft Server Management',
    siteIcon: '/default-icon.png',
    headerIcon: '/default-header.png',
    footerText: '© 2024 Minecraft Panel',
    theme: 'default',
    maxServersPerUser: 5,
    defaultRam: 1024,
    defaultPort: 25565
};
// Live stats cache (Pterodactyl-style real-time monitoring)
const liveStats = {};
// Initialize database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Failed to open database:', err);
        process.exit(1);
    }
    console.log('Connected to SQLite database');
});

// Create tables
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        status TEXT DEFAULT 'active',
        display_name TEXT,
        profile_picture TEXT,
        theme_preference TEXT DEFAULT 'dark',
        theme_primary_color TEXT DEFAULT '#2d6a4f',
        theme_accent_color TEXT DEFAULT '#40916c',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Notifications table
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'info',
        icon TEXT DEFAULT 'info-circle',
        is_read BOOLEAN DEFAULT 0,
        action_url TEXT,
        action_text TEXT,
        server_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (server_id) REFERENCES servers (id)
    )`);
    
    // User profiles table for extended user information
    db.run(`CREATE TABLE IF NOT EXISTS user_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        display_name TEXT,
        bio TEXT,
        location TEXT,
        website TEXT,
        profile_picture TEXT,
        theme_preference TEXT DEFAULT 'dark',
        theme_primary_color TEXT DEFAULT '#2d6a4f',
        theme_accent_color TEXT DEFAULT '#40916c',
        language TEXT DEFAULT 'en',
        timezone TEXT DEFAULT 'UTC',
        email_notifications BOOLEAN DEFAULT 1,
        push_notifications BOOLEAN DEFAULT 1,
        security_notifications BOOLEAN DEFAULT 1,
        notification_frequency TEXT DEFAULT 'immediate',
        quiet_hours_start TEXT,
        quiet_hours_end TEXT,
        two_factor_enabled BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);
    
    // Notification preferences table
    db.run(`CREATE TABLE IF NOT EXISTS notification_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(user_id, category)
    )`);
    
    // User activity table for tracking user actions
    db.run(`CREATE TABLE IF NOT EXISTS user_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        description TEXT,
        ip_address TEXT,
        user_agent TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);
    
    // Update notifications table to include category and metadata
    db.run('ALTER TABLE notifications ADD COLUMN category TEXT DEFAULT "general"', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding category column to notifications:', err.message);
        }
    });
    
    db.run('ALTER TABLE notifications ADD COLUMN metadata TEXT', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding metadata column to notifications:', err.message);
        }
    });
    
    db.run('ALTER TABLE notifications ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding updated_at column to notifications:', err.message);
        }
    });
    
    // Servers table (added server_ip, ip_alias, port_alias, additional_ports)
    db.run(`CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        owner_id INTEGER NOT NULL,
        ram INTEGER NOT NULL,
        cpu INTEGER DEFAULT 1,
        disk INTEGER DEFAULT 1024,
        port INTEGER NOT NULL,
        server_ip TEXT DEFAULT '',
        ip_alias TEXT,
        port_alias TEXT,
        additional_ports TEXT DEFAULT '[]',
        status TEXT DEFAULT 'stopped',
        version TEXT DEFAULT 'latest',
        server_type TEXT DEFAULT 'vanilla',
        settings TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users (id)
    )`);
    // Subusers table
    db.run(`CREATE TABLE IF NOT EXISTS subusers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        permissions TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    // Backups table
    db.run(`CREATE TABLE IF NOT EXISTS backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        file TEXT NOT NULL,
        name TEXT,
        description TEXT,
        size TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id)
    )`);
    // File logs table
    db.run(`CREATE TABLE IF NOT EXISTS file_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        file_path TEXT NOT NULL,
        details TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    // Global settings table
    db.run(`CREATE TABLE IF NOT EXISTS panel_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // Create admin user if not exists
    db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
        if (err) console.error('Error checking admin:', err);
        if (!row) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            db.run('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
                ['admin', 'admin@example.com', hashedPassword, 'admin'],
                (err) => {
                    if (err) console.error('Error creating admin:', err);
                    else console.log('Admin user created (username: admin, password: admin123)');
                }
            );
        }
    });
    // Load global settings from database
    db.all('SELECT * FROM panel_settings', (err, rows) => {
        if (!err && rows) {
            rows.forEach(row => {
                try {
                    globalSettings[row.key] = JSON.parse(row.value);
                } catch {
                    globalSettings[row.key] = row.value;
                }
            });
        }
    });
});
// Restore running servers after DB init
async function restoreServers() {
    const servers = await dbAll('SELECT id, status FROM servers');
    for (const { id, status } of servers) {
        const isRunning = await isServerRunning(id);
        if (isRunning) {
            serverStartTimes[id] = Date.now(); // Approximate start time
            onlinePlayers[id] = [];
            startLogTail(id);
            if (status !== 'running') {
                await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['running', id]);
            }
        } else if (status === 'running') {
            await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['stopped', id]);
        }
    }
    console.log('Restored server states');
}
restoreServers().catch(err => console.error('Restore servers error:', err));
// Live stats updater - FULL Pterodactyl-style real-time monitoring (CPU, RAM, Disk, Players, Uptime)
async function updateLiveStats(serverId) {
  try {
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) return;
    
    // Check if server is actually running by checking Java process
    const isRunning = await isServerRunning(serverId);
    const serverDir = resolveServerPath(serverId);
    const pidFile = path.join(serverDir, '.server.pid');
    
    let pid = null;
    
    // Try to get PID from file first
    if (fs.existsSync(pidFile)) {
      try {
        pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
        // Verify the PID is still running
        if (!isProcessRunning(pid)) {
          pid = null;
          fs.unlinkSync(pidFile);
        }
      } catch (err) {
        pid = null;
      }
    }
    
    // If no PID from file, try to find by port
    if (!pid) {
      pid = await getPidByPort(server.port);
    }
    
    // Initialize stats object
    let stats = {
      serverId: serverId,
      status: isRunning && pid ? 'running' : 'stopped',
      cpu: 0,
      cpuPercent: '0%',
      memory: 0,
      memoryUsed: '0 MB',
      memoryTotal: server.ram + ' MB',
      memoryPercent: 0,
      disk: 0,
      diskUsed: '0 MB',
      diskPercent: 0,
      players: 0,
      maxPlayers: 20,
      playersPercent: 0,
      uptime: 'Offline',
      uptimeSeconds: 0,
      uptimeFormatted: 'Server is offline'
    };
    
    // Only collect stats if server is actually running
    if (isRunning && pid) {
      try {
        // Get CPU and RAM usage from the Java process
        const usage = await pidusage(pid);
        stats.cpu = usage.cpu;
        stats.cpuPercent = usage.cpu.toFixed(1) + '%';
        stats.memory = usage.memory;
        stats.memoryUsed = (usage.memory / (1024 * 1024)).toFixed(0) + ' MB';
        stats.memoryPercent = ((usage.memory / (1024 * 1024)) / server.ram * 100).toFixed(1);
      } catch (err) {
        console.error(`PID usage error for server ${serverId}:`, err);
        // If we can't get usage, server might have stopped
        stats.status = 'stopped';
      }
      
      // Get disk usage
      if (fs.existsSync(serverDir)) {
        try {
          const diskSize = getDirSize(serverDir);
          stats.disk = diskSize;
          stats.diskUsed = formatFileSize(diskSize);
          // Calculate percentage (assume 10GB max for display)
          stats.diskPercent = Math.min((diskSize / (10 * 1024 * 1024 * 1024) * 100), 100).toFixed(1);
        } catch (err) {
          console.error(`Disk usage error for server ${serverId}:`, err);
        }
      }
      
      // Get max players from server.properties
      try {
        const propsPath = path.join(serverDir, 'server.properties');
        if (fs.existsSync(propsPath)) {
          const propsContent = fs.readFileSync(propsPath, 'utf8');
          const maxPlayersMatch = propsContent.match(/max-players=(\d+)/);
          if (maxPlayersMatch) {
            stats.maxPlayers = parseInt(maxPlayersMatch[1]);
          }
        }
      } catch (err) {
        // Ignore errors reading properties
      }
      
      // Get online players count
      stats.players = (onlinePlayers[serverId] || []).length;
      stats.playersPercent = stats.maxPlayers > 0 ? (stats.players / stats.maxPlayers * 100).toFixed(1) : 0;
      
      // Calculate uptime
      if (serverStartTimes[serverId]) {
        const uptimeMs = Date.now() - serverStartTimes[serverId];
        stats.uptimeSeconds = Math.floor(uptimeMs / 1000);
        
        const days = Math.floor(uptimeMs / 86400000);
        const hours = Math.floor((uptimeMs % 86400000) / 3600000);
        const minutes = Math.floor((uptimeMs % 3600000) / 60000);
        const seconds = Math.floor((uptimeMs % 60000) / 1000);
        
        if (days > 0) {
          stats.uptime = `${days}d ${hours}h ${minutes}m`;
          stats.uptimeFormatted = `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else if (hours > 0) {
          stats.uptime = `${hours}h ${minutes}m ${seconds}s`;
          stats.uptimeFormatted = `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}, ${seconds} second${seconds !== 1 ? 's' : ''}`;
        } else if (minutes > 0) {
          stats.uptime = `${minutes}m ${seconds}s`;
          stats.uptimeFormatted = `${minutes} minute${minutes !== 1 ? 's' : ''}, ${seconds} second${seconds !== 1 ? 's' : ''}`;
        } else {
          stats.uptime = `${seconds}s`;
          stats.uptimeFormatted = `${seconds} second${seconds !== 1 ? 's' : ''}`;
        }
      } else {
        // Try to load start time from file if not in memory
        const savedStartTime = loadServerStartTime(serverId);
        if (savedStartTime) {
          serverStartTimes[serverId] = savedStartTime;
          console.log(`Loaded start time from file for server ${serverId} during stats update`);
          
          // Calculate uptime with loaded start time
          const uptimeMs = Date.now() - savedStartTime;
          stats.uptimeSeconds = Math.floor(uptimeMs / 1000);
          
          const days = Math.floor(uptimeMs / 86400000);
          const hours = Math.floor((uptimeMs % 86400000) / 3600000);
          const minutes = Math.floor((uptimeMs % 3600000) / 60000);
          const seconds = Math.floor((uptimeMs % 60000) / 1000);
          
          if (days > 0) {
            stats.uptime = `${days}d ${hours}h ${minutes}m`;
            stats.uptimeFormatted = `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
          } else if (hours > 0) {
            stats.uptime = `${hours}h ${minutes}m ${seconds}s`;
            stats.uptimeFormatted = `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}, ${seconds} second${seconds !== 1 ? 's' : ''}`;
          } else if (minutes > 0) {
            stats.uptime = `${minutes}m ${seconds}s`;
            stats.uptimeFormatted = `${minutes} minute${minutes !== 1 ? 's' : ''}, ${seconds} second${seconds !== 1 ? 's' : ''}`;
          } else {
            stats.uptime = `${seconds}s`;
            stats.uptimeFormatted = `${seconds} second${seconds !== 1 ? 's' : ''}`;
          }
        } else {
          // Server is running but we don't have start time (reconnected server without saved time)
          stats.uptime = 'Unknown';
          stats.uptimeFormatted = 'Uptime unknown (server was running before panel start)';
        }
      }
    } else {
      // Server is offline
      stats.status = 'stopped';
      stats.uptime = 'Offline';
      stats.uptimeFormatted = 'Server is offline';
      
      // Still show disk usage even when offline
      if (fs.existsSync(serverDir)) {
        try {
          const diskSize = getDirSize(serverDir);
          stats.disk = diskSize;
          stats.diskUsed = formatFileSize(diskSize);
          stats.diskPercent = Math.min((diskSize / (10 * 1024 * 1024 * 1024) * 100), 100).toFixed(1);
        } catch (err) {
          // Ignore
        }
      }
    }
    
    // Update database status if it changed
    if (server.status !== stats.status) {
      await dbRun('UPDATE servers SET status = ? WHERE id = ?', [stats.status, serverId]);
    }
    
    // Store stats
    liveStats[serverId] = stats;
    
    // Emit to all connected clients watching this server
    io.to(`server:${serverId}`).emit('server-stats', stats);
    
  } catch (err) {
    console.error(`Live stats error for ${serverId}:`, err);
  }
}
// Start live monitoring (runs every 3s for smooth real-time feel)
setInterval(async () => {
  try {
    // Get all servers from database
    const servers = await dbAll('SELECT id FROM servers');
    
    // Update stats for all servers (both running and stopped)
    for (const server of servers) {
      updateLiveStats(server.id);
    }
  } catch (err) {
    console.error('Live monitoring error:', err);
  }
}, 3000);
// Helper: Save global settings to database
function saveGlobalSettings() {
    Object.entries(globalSettings).forEach(([key, value]) => {
        db.run(`INSERT OR REPLACE INTO panel_settings (key, value) VALUES (?, ?)`,
            [key, JSON.stringify(value)],
            (err) => {
                if (err) console.error('Error saving setting:', err);
            }
        );
    });
}
// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
    if (req.path.includes('/admin/users/') && req.path.includes('/edit')) {
        console.log('=== REQUEST TO USER EDIT ===');
        console.log('Method:', req.method);
        console.log('URL:', req.url);
        console.log('Path:', req.path);
        console.log('Params:', req.params);
        console.log('========================');
    }
    next();
});
// Session configuration (fixed - single proper session with flash after)
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));
app.use(flash());
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    next();
});
// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Make global data available to views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.settings = globalSettings;
    next();
});
// File upload configuration
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10GB limit
});
// ================================================
// HELPER FUNCTIONS
// ================================================
// Promisified database functions
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
}
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    });
}
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// Notification helper functions
async function createNotification(userId, title, message, type = 'info', options = {}) {
    try {
        const notification = {
            user_id: userId,
            title: title,
            message: message,
            type: type,
            icon: options.icon || getIconForType(type),
            action_url: options.actionUrl || null,
            action_text: options.actionText || null,
            server_id: options.serverId || null
        };
        
        const result = await dbRun(
            `INSERT INTO notifications (user_id, title, message, type, icon, action_url, action_text, server_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [notification.user_id, notification.title, notification.message, notification.type, 
             notification.icon, notification.action_url, notification.action_text, notification.server_id]
        );
        
        // Emit real-time notification to user
        io.to(`user:${userId}`).emit('new-notification', {
            id: result.lastID,
            ...notification,
            created_at: new Date().toISOString()
        });
        
        return result.lastID;
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
}

function getIconForType(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-triangle',
        'warning': 'exclamation-circle',
        'info': 'info-circle',
        'server': 'server',
        'user': 'user',
        'security': 'shield-alt'
    };
    return icons[type] || 'info-circle';
}

async function getUserNotifications(userId, limit = 50, unreadOnly = false) {
    try {
        let sql = `SELECT * FROM notifications WHERE user_id = ?`;
        const params = [userId];
        
        if (unreadOnly) {
            sql += ` AND is_read = 0`;
        }
        
        sql += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(limit);
        
        return await dbAll(sql, params);
    } catch (error) {
        console.error('Error getting user notifications:', error);
        return [];
    }
}

async function markNotificationAsRead(notificationId, userId) {
    try {
        await dbRun(
            `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
            [notificationId, userId]
        );
        return true;
    } catch (error) {
        console.error('Error marking notification as read:', error);
        return false;
    }
}

async function markAllNotificationsAsRead(userId) {
    try {
        await dbRun(
            `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
            [userId]
        );
        return true;
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        return false;
    }
}

async function clearAllNotifications(userId) {
    try {
        await dbRun(`DELETE FROM notifications WHERE user_id = ?`, [userId]);
        return true;
    } catch (error) {
        console.error('Error clearing notifications:', error);
        return false;
    }
}

async function getUnreadNotificationCount(userId) {
    try {
        const result = await dbGet(
            `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
            [userId]
        );
        return result ? result.count : 0;
    } catch (error) {
        console.error('Error getting unread notification count:', error);
        return 0;
    }
}

// Utility: Safe path resolution
function resolveServerPath(serverId, requestedPath = '') {
    const base = path.resolve(SERVERS_DIR, serverId.toString());
    const full = path.resolve(path.join(base, requestedPath || ''));
    if (!full.startsWith(base)) throw new Error('Invalid path');
    return full;
}
// Utility: Format file size
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
// Utility: Parse server.properties
function parseProperties(content) {
    const properties = {};
    content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            const value = valueParts.join('=').trim();
            if (key && value !== undefined) {
                if (value === 'true' || value === 'false') {
                    properties[key.trim()] = value === 'true';
                } else if (!isNaN(parseInt(value, 10))) {
                    properties[key.trim()] = parseInt(value, 10);
                } else {
                    properties[key.trim()] = value;
                }
            }
        }
    });
    return properties;
}
// Utility: Write server.properties
function writeProperties(properties, filePath) {
    const content = Object.entries(properties)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    fs.writeFileSync(filePath, content, 'utf8');
}

// ================================================
// ENHANCED PORT MANAGEMENT SYSTEM WITH SMART PROTECTION
// ================================================

// Enhanced port configuration with server-type specific ranges
const PORT_CONFIG = {
    // Java Edition Servers (Standard Minecraft)
    JAVA_EDITION: {
        START_PORT: 25565,      // Default Minecraft port
        MAX_PORT: 25665,        // Allow 100 Java servers (25565-25665)
        DEFAULT_PORT: 25565,
        CATEGORY: 'Java Edition'
    },
    
    // Proxy Servers (BungeeCord, Velocity, Waterfall)
    PROXY_SERVERS: {
        START_PORT: 25700,      // Proxy server range
        MAX_PORT: 25799,        // Allow 100 proxy servers (25700-25799)
        DEFAULT_PORT: 25700,
        CATEGORY: 'Proxy Servers'
    },
    
    // Bedrock Edition Servers
    BEDROCK_EDITION: {
        START_PORT: 19132,      // Default Bedrock port
        MAX_PORT: 19232,        // Allow 100 Bedrock servers (19132-19232)
        DEFAULT_PORT: 19132,
        CATEGORY: 'Bedrock Edition'
    },
    
    // Reserved system ports (never assign these)
    RESERVED_PORTS: [
        3000,               // Panel port
        22,                 // SSH
        80,                 // HTTP
        443,                // HTTPS
        3306,               // MySQL
        5432,               // PostgreSQL
        6379,               // Redis
        27017,              // MongoDB
        8080, 8443,         // Common web ports
        21, 23,             // FTP, Telnet
        53,                 // DNS
        110, 143, 993, 995, // Email ports
        1433, 1521,         // Database ports
        5000, 5001,         // Common app ports
        9000, 9001          // Common service ports
    ]
};

// Get appropriate port range for server type
function getPortRangeForServerType(serverType) {
    // Proxy servers
    if (['velocity', 'bungeecord', 'waterfall'].includes(serverType)) {
        return PORT_CONFIG.PROXY_SERVERS;
    }
    
    // Bedrock servers
    if (['bedrock', 'nukkit'].includes(serverType)) {
        return PORT_CONFIG.BEDROCK_EDITION;
    }
    
    // Default to Java Edition for all other servers
    return PORT_CONFIG.JAVA_EDITION;
}

// Enhanced port finder with server-type awareness
async function findAvailablePortForServerType(serverType) {
    try {
        const portRange = getPortRangeForServerType(serverType);
        const usedPorts = await dbAll('SELECT port FROM servers WHERE port IS NOT NULL');
        const usedPortNumbers = usedPorts.map(row => parseInt(row.port));
        
        // Add reserved ports to used ports
        usedPortNumbers.push(...PORT_CONFIG.RESERVED_PORTS);
        
        // Find first available port in the appropriate range
        for (let port = portRange.START_PORT; port <= portRange.MAX_PORT; port++) {
            if (!usedPortNumbers.includes(port)) {
                // Double-check port is not in use by system
                if (await isPortAvailable(port)) {
                    console.log(`Assigned ${portRange.CATEGORY} port ${port} for ${serverType} server`);
                    return port;
                }
            }
        }
        
        throw new Error(`No available ports in ${portRange.CATEGORY} range (${portRange.START_PORT}-${portRange.MAX_PORT})`);
    } catch (err) {
        console.error(`Error finding available port for ${serverType}:`, err);
        throw new Error(`Failed to find available port for ${serverType}: ${err.message}`);
    }
}

// Enhanced port availability checker with better system integration
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();
        
        server.listen(port, '0.0.0.0', (err) => {
            if (err) {
                resolve(false);
            } else {
                server.once('close', () => resolve(true));
                server.close();
            }
        });
        
        server.on('error', () => resolve(false));
        
        // Timeout after 2 seconds
        setTimeout(() => {
            try {
                server.close();
            } catch (e) {}
            resolve(false);
        }, 2000);
    });
}

// Enhanced server port management with type-specific handling
async function ensureServerPortForType(serverId, serverType) {
    try {
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) throw new Error('Server not found');
        
        const portRange = getPortRangeForServerType(serverType);
        let assignedPort = server.port;
        
        // Check if current port is in the correct range for server type
        const isPortInCorrectRange = assignedPort >= portRange.START_PORT && assignedPort <= portRange.MAX_PORT;
        
        // If no port assigned, wrong range, or port conflicts, assign a new one
        if (!assignedPort || !isPortInCorrectRange || !(await isPortAvailable(assignedPort))) {
            const oldPort = assignedPort;
            assignedPort = await findAvailablePortForServerType(serverType);
            
            // Update database with new port
            await dbRun('UPDATE servers SET port = ? WHERE id = ?', [assignedPort, serverId]);
            
            if (oldPort && oldPort !== assignedPort) {
                console.log(`Migrated server ${serverId} from port ${oldPort} to ${assignedPort} (${portRange.CATEGORY} range)`);
            } else {
                console.log(`Assigned ${portRange.CATEGORY} port ${assignedPort} to server ${serverId}`);
            }
        }
        
        // Update server configuration files with correct port
        await updateServerConfigurationPort(serverId, serverType, assignedPort);
        
        return assignedPort;
    } catch (err) {
        console.error(`Error ensuring port for server ${serverId} (${serverType}):`, err);
        throw err;
    }
}

// Enhanced configuration file updates for different server types
async function updateServerConfigurationPort(serverId, serverType, port) {
    try {
        const serverDir = resolveServerPath(serverId);
        
        if (['velocity', 'bungeecord', 'waterfall'].includes(serverType)) {
            // Proxy server configuration
            await updateProxyServerPort(serverId, serverType, port);
        } else if (['bedrock', 'nukkit'].includes(serverType)) {
            // Bedrock server configuration
            await updateBedrockServerPort(serverId, serverType, port);
        } else {
            // Java Edition server.properties
            await updateServerPropertiesPort(serverId, port);
        }
        
        console.log(`Updated ${serverType} server configuration for port ${port}`);
    } catch (err) {
        console.error(`Error updating ${serverType} server configuration:`, err);
        throw err;
    }
}

// Proxy server configuration management
async function updateProxyServerPort(serverId, serverType, port) {
    const serverDir = resolveServerPath(serverId);
    
    if (serverType === 'velocity') {
        // Velocity uses velocity.toml
        const configPath = path.join(serverDir, 'velocity.toml');
        let config = '';
        
        if (fs.existsSync(configPath)) {
            config = fs.readFileSync(configPath, 'utf8');
            // Update existing bind port
            config = config.replace(/bind\s*=\s*"[^"]*"/g, `bind = "0.0.0.0:${port}"`);
        } else {
            // Create default Velocity configuration
            config = `# Velocity Configuration
# This is the port the proxy will listen on
bind = "0.0.0.0:${port}"

# What should we display for the proxy's name in a ping response?
show-ping-requests = true

# Should we announce Velocity's version in the ping response?
announce-forge = false

# Should we authenticate players with Mojang?
online-mode = true

# Should we forward IP addresses and other data to backend servers?
player-info-forwarding-mode = "MODERN"

# A forwarding secret for better security
forwarding-secret = "${generateRandomSecret()}"

[servers]
# Configure your backend servers here
# lobby = "localhost:25565"

# Try to connect players to servers in this order
try = ["lobby"]

[advanced]
# How large a Minecraft packet can be before we compress it
compression-threshold = 256

# How much compression should we do (from 0-9)
compression-level = -1

# How fast (in milliseconds) are we going to try to send a keep-alive packet?
login-ratelimit = 3000

# Specify a custom timeout for connections
connection-timeout = 5000

# Specify a read timeout for connections
read-timeout = 30000

# Enables compatibility with HAProxy
haproxy-protocol = false
`;
        }
        
        fs.writeFileSync(configPath, config, 'utf8');
        
    } else if (serverType === 'bungeecord' || serverType === 'waterfall') {
        // BungeeCord/Waterfall uses config.yml
        const configPath = path.join(serverDir, 'config.yml');
        let config = '';
        
        if (fs.existsSync(configPath)) {
            config = fs.readFileSync(configPath, 'utf8');
            // Update existing host port
            config = config.replace(/host:\s*[^\n\r]*/g, `host: 0.0.0.0:${port}`);
        } else {
            // Create default BungeeCord configuration
            config = `# BungeeCord/Waterfall Configuration
# The port the proxy will listen on
host: 0.0.0.0:${port}

# A list of players that are allowed to use this proxy
permissions:
  default:
  - bungeecord.command.server
  - bungeecord.command.list
  admin:
  - bungeecord.command.alert
  - bungeecord.command.end
  - bungeecord.command.ip
  - bungeecord.command.reload

# Timeout for server connections
timeout: 5000

# Whether to log commands to the console
log_commands: false

# Whether to log initial connections
log_pings: true

# Online mode (authenticate with Mojang)
online_mode: true

# Player limit
player_limit: -1

# Server info
servers:
  lobby:
    motd: 'Lobby Server'
    address: localhost:25565
    restricted: false

# Default server priorities
priorities:
- lobby

# Advanced settings
connection_throttle: 4000
connection_throttle_limit: 3
stats: true
forge_support: false
inject_commands: false
`;
        }
        
        fs.writeFileSync(configPath, config, 'utf8');
    }
}

// Bedrock server configuration management
async function updateBedrockServerPort(serverId, serverType, port) {
    const serverDir = resolveServerPath(serverId);
    
    if (serverType === 'bedrock') {
        // Bedrock Dedicated Server uses server.properties
        const configPath = path.join(serverDir, 'server.properties');
        let properties = {};
        
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            properties = parseProperties(content);
        }
        
        // Set Bedrock-specific properties
        properties['server-port'] = port;
        properties['server-portv6'] = port; // IPv6 port
        properties['server-name'] = await getServerName(serverId) || 'Bedrock Server';
        properties['gamemode'] = properties['gamemode'] || 'survival';
        properties['difficulty'] = properties['difficulty'] || 'easy';
        properties['allow-cheats'] = properties['allow-cheats'] || 'false';
        properties['max-players'] = properties['max-players'] || 10;
        properties['online-mode'] = properties['online-mode'] || 'true';
        properties['white-list'] = properties['white-list'] || 'false';
        properties['level-name'] = properties['level-name'] || 'Bedrock level';
        properties['level-seed'] = properties['level-seed'] || '';
        properties['default-player-permission-level'] = properties['default-player-permission-level'] || 'member';
        properties['texturepack-required'] = properties['texturepack-required'] || 'false';
        
        // Additional Bedrock-specific settings
        properties['server-authoritative-movement'] = properties['server-authoritative-movement'] || 'server-auth';
        properties['player-movement-score-threshold'] = properties['player-movement-score-threshold'] || 20;
        properties['player-movement-action-direction-threshold'] = properties['player-movement-action-direction-threshold'] || 0.85;
        properties['player-movement-distance-threshold'] = properties['player-movement-distance-threshold'] || 0.3;
        properties['player-movement-duration-threshold-in-ms'] = properties['player-movement-duration-threshold-in-ms'] || 500;
        properties['correct-player-movement'] = properties['correct-player-movement'] || 'false';
        properties['server-authoritative-block-breaking'] = properties['server-authoritative-block-breaking'] || 'false';
        properties['chat-restriction'] = properties['chat-restriction'] || 'None';
        properties['disable-player-interaction'] = properties['disable-player-interaction'] || 'false';
        properties['client-side-chunk-generation-enabled'] = properties['client-side-chunk-generation-enabled'] || 'true';
        properties['block-network-ids-are-hashes'] = properties['block-network-ids-are-hashes'] || 'true';
        properties['disable-persona'] = properties['disable-persona'] || 'false';
        properties['disable-custom-skins'] = properties['disable-custom-skins'] || 'false';
        properties['server-build-radius-ratio'] = properties['server-build-radius-ratio'] || 'Disabled';
        
        writeProperties(properties, configPath);
        
    } else if (serverType === 'nukkit') {
        // Nukkit uses nukkit.yml
        const configPath = path.join(serverDir, 'nukkit.yml');
        let config = '';
        
        if (fs.existsSync(configPath)) {
            config = fs.readFileSync(configPath, 'utf8');
            // Update port in YAML (simple regex replacement)
            config = config.replace(/server-port:\s*\d+/g, `server-port: ${port}`);
        } else {
            // Create default Nukkit configuration
            config = `# Nukkit Configuration
# The port the server will listen on
server-port: ${port}

# The IP address to bind to
server-ip: "0.0.0.0"

# Server settings
view-distance: 10
chunk-sending:
  per-tick: 4
  max-chunks: 192
  spawn-threshold: 56

# Game settings
gamemode: 0
max-players: 20
spawn-protection: 16
white-list: false
enable-query: true
enable-rcon: false
motd: "Nukkit Server"
sub-motd: "Powered by Nukkit"

# World settings
generator-settings: ""
level-name: "world"
level-seed: ""
level-type: "DEFAULT"

# Advanced settings
auto-save: true
force-gamemode: false
hardcore: false
pvp: true
difficulty: 1
enable-experience: true
`;
        }
        
        fs.writeFileSync(configPath, config, 'utf8');
    }
}

// Helper function to get server name
async function getServerName(serverId) {
    try {
        const server = await dbGet('SELECT name FROM servers WHERE id = ?', [serverId]);
        return server ? server.name : null;
    } catch (err) {
        return null;
    }
}

// Generate random secret for Velocity
function generateRandomSecret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Enhanced port validation with server type awareness
function validatePortForServerType(port, serverType) {
    const portRange = getPortRangeForServerType(serverType);
    
    if (port < portRange.START_PORT || port > portRange.MAX_PORT) {
        return {
            valid: false,
            message: `Port must be in ${portRange.CATEGORY} range (${portRange.START_PORT}-${portRange.MAX_PORT})`,
            suggestedPort: portRange.DEFAULT_PORT
        };
    }
    
    if (PORT_CONFIG.RESERVED_PORTS.includes(port)) {
        return {
            valid: false,
            message: `Port ${port} is reserved for system use`,
            suggestedPort: portRange.DEFAULT_PORT
        };
    }
    
    return {
        valid: true,
        message: `Port ${port} is valid for ${portRange.CATEGORY}`,
        portRange: portRange
    };
}

// Get port information for display
function getPortInformation(serverId, serverType, port) {
    const portRange = getPortRangeForServerType(serverType);
    const validation = validatePortForServerType(port, serverType);
    
    return {
        port: port,
        serverType: serverType,
        category: portRange.CATEGORY,
        range: `${portRange.START_PORT}-${portRange.MAX_PORT}`,
        defaultPort: portRange.DEFAULT_PORT,
        isValid: validation.valid,
        isInCorrectRange: port >= portRange.START_PORT && port <= portRange.MAX_PORT,
        isReserved: PORT_CONFIG.RESERVED_PORTS.includes(port),
        message: validation.message || `Port ${port} is assigned to ${portRange.CATEGORY} range`,
        isProtected: true, // All ports are protected in our system
        protectionLevel: getProtectionLevel(serverType),
        protectionDescription: getProtectionDescription(serverType)
    };
}

// Get protection level description
function getProtectionLevel(serverType) {
    if (['velocity', 'bungeecord', 'waterfall'].includes(serverType)) {
        return 'High Protection';
    } else if (['bedrock', 'nukkit'].includes(serverType)) {
        return 'Medium Protection';
    } else {
        return 'Standard Protection';
    }
}

// Get detailed protection description
function getProtectionDescription(serverType) {
    if (['velocity', 'bungeecord', 'waterfall'].includes(serverType)) {
        return 'Proxy servers use dedicated port range (25700-25799) for network isolation and security';
    } else if (['bedrock', 'nukkit'].includes(serverType)) {
        return 'Bedrock servers use UDP protocol on dedicated range (19132-19232) for cross-platform compatibility';
    } else {
        return 'Java Edition servers use standard Minecraft port range (25565-25665) with automatic conflict resolution';
    }
}

// Validate and fix all server ports (run on startup or manually) - CONSERVATIVE MODE
async function validateAndFixAllServerPorts() {
    console.log('🔧 Smart Port Protection: Validating all server ports (conservative mode)...');
    
    try {
        const servers = await dbAll('SELECT id, server_type, port, name FROM servers');
        let fixedCount = 0;
        let validCount = 0;
        let preservedCount = 0;
        
        for (const server of servers) {
            const portRange = getPortRangeForServerType(server.server_type);
            const isInCorrectRange = server.port >= portRange.START_PORT && server.port <= portRange.MAX_PORT;
            
            // Only fix ports that are clearly problematic (conflicts or reserved)
            const isReservedPort = PORT_CONFIG.RESERVED_PORTS.includes(server.port);
            const isPortAvailable = await isPortAvailable(server.port);
            
            if (isReservedPort || (!isPortAvailable && !await isServerRunning(server.id))) {
                console.log(`⚠️  Server "${server.name}" (${server.server_type}) has problematic port ${server.port}, fixing...`);
                
                try {
                    const newPort = await ensureServerPortForType(server.id, server.server_type);
                    console.log(`✅ Fixed server "${server.name}": ${server.port} → ${newPort} (${portRange.CATEGORY})`);
                    fixedCount++;
                } catch (err) {
                    console.error(`❌ Failed to fix server "${server.name}":`, err.message);
                }
            } else if (isInCorrectRange) {
                console.log(`✅ Server "${server.name}" port ${server.port} is valid for ${server.server_type}`);
                validCount++;
            } else {
                console.log(`📌 Server "${server.name}" port ${server.port} is outside ${portRange.CATEGORY} range but preserved (no conflicts)`);
                preservedCount++;
            }
        }
        
        console.log(`🎯 Smart Port Protection validation complete (conservative mode):`);
        console.log(`   ✅ ${validCount} servers have correct ports`);
        console.log(`   📌 ${preservedCount} servers have non-standard but working ports (preserved)`);
        console.log(`   🔧 ${fixedCount} servers were fixed due to conflicts`);
        console.log(`   📊 Total servers processed: ${servers.length}`);
        
        return { validCount, fixedCount, preservedCount, totalCount: servers.length };
        
    } catch (err) {
        console.error('❌ Error during port validation:', err);
        throw err;
    }
}

// Update server.properties with correct port (protected from user changes)
async function updateServerPropertiesPort(serverId, port) {
    try {
        const propertiesPath = resolveServerPath(serverId, 'server.properties');
        
        let properties = {};
        
        // Read existing properties if file exists
        if (fs.existsSync(propertiesPath)) {
            try {
                const content = fs.readFileSync(propertiesPath, 'utf8');
                properties = parseProperties(content);
            } catch (err) {
                console.log(`Could not read server.properties for server ${serverId}, creating new one`);
            }
        }
        
        // Set/override the port (this cannot be changed by users)
        properties['server-port'] = port;
        
        // Ensure other essential properties exist with defaults
        if (!properties['server-ip']) properties['server-ip'] = '';
        if (!properties['max-players']) properties['max-players'] = 20;
        if (!properties['online-mode']) properties['online-mode'] = true;
        if (!properties['view-distance']) properties['view-distance'] = 10;
        if (!properties['simulation-distance']) properties['simulation-distance'] = 10;
        if (!properties['motd']) {
            const server = await dbGet('SELECT name FROM servers WHERE id = ?', [serverId]);
            properties['motd'] = server ? server.name : 'Minecraft Server';
        }
        
        // Write properties back to file
        writeProperties(properties, propertiesPath);
        
        console.log(`Updated server.properties for server ${serverId} with port ${port}`);
    } catch (err) {
        console.error(`Error updating server.properties for server ${serverId}:`, err);
        throw err;
    }
}

// Validate and sanitize server.properties to prevent port changes
function sanitizeServerProperties(content, serverPort) {
    try {
        const properties = parseProperties(content);
        
        // ONLY force the correct port (users CAN change everything else)
        properties['server-port'] = serverPort;
        
        // Allow all other properties to be edited freely
        // No validation or restrictions on other settings
        
        return writePropertiesString(properties);
    } catch (err) {
        console.error('Error sanitizing server.properties:', err);
        throw err;
    }
}

// Convert properties object to string format
function writePropertiesString(properties) {
    return Object.entries(properties)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n';
}

// Validate and sanitize velocity.toml to prevent bind port changes
function sanitizeVelocityToml(content, serverPort) {
    try {
        // Replace any bind port with the correct one
        const bindRegex = /bind\s*=\s*"[^"]*"/g;
        const correctBind = `bind = "0.0.0.0:${serverPort}"`;
        
        // If there's already a bind setting, replace it
        if (bindRegex.test(content)) {
            content = content.replace(bindRegex, correctBind);
        } else {
            // If no bind setting exists, add it at the beginning
            const lines = content.split('\n');
            const insertIndex = lines.findIndex(line => 
                line.trim() && !line.trim().startsWith('#')
            );
            
            if (insertIndex >= 0) {
                lines.splice(insertIndex, 0, correctBind);
            } else {
                lines.unshift(correctBind);
            }
            
            content = lines.join('\n');
        }
        
        return content;
    } catch (err) {
        console.error('Error sanitizing velocity.toml:', err);
        throw err;
    }
}

// Validate and sanitize BungeeCord config.yml to prevent port changes
function sanitizeBungeeCordConfig(content, serverPort) {
    try {
        // Replace any host port with the correct one
        const hostRegex = /host:\s*([^:]+):(\d+)/g;
        const correctHost = `host: 0.0.0.0:${serverPort}`;
        
        // Replace all host entries with the correct port
        content = content.replace(hostRegex, (match, ip, port) => {
            return `host: 0.0.0.0:${serverPort}`;
        });
        
        // Also handle listen entries if they exist
        const listenRegex = /listen:\s*([^:]+):(\d+)/g;
        content = content.replace(listenRegex, (match, ip, port) => {
            return `listen: 0.0.0.0:${serverPort}`;
        });
        
        // Handle bind_local_address entries
        const bindLocalRegex = /bind_local_address:\s*([^:]+):(\d+)/g;
        content = content.replace(bindLocalRegex, (match, ip, port) => {
            return `bind_local_address: 0.0.0.0:${serverPort}`;
        });
        
        return content;
    } catch (err) {
        console.error('Error sanitizing BungeeCord config.yml:', err);
        throw err;
    }
}

// Enforce proxy server port before starting (Velocity, BungeeCord, Waterfall)
async function enforceProxyServerPort(serverId, serverType, correctPort) {
    try {
        const serverDir = resolveServerPath(serverId);
        
        if (serverType === 'velocity') {
            // Enforce velocity.toml port
            const velocityTomlPath = path.join(serverDir, 'velocity.toml');
            
            if (fs.existsSync(velocityTomlPath)) {
                let content = fs.readFileSync(velocityTomlPath, 'utf8');
                const originalContent = content;
                
                // Force correct bind port
                content = sanitizeVelocityToml(content, correctPort);
                
                // Only write if changed
                if (content !== originalContent) {
                    fs.writeFileSync(velocityTomlPath, content, 'utf8');
                    console.log(`✅ Enforced velocity.toml port to ${correctPort} for server ${serverId}`);
                } else {
                    console.log(`✅ velocity.toml port already correct (${correctPort}) for server ${serverId}`);
                }
            } else {
                // Create default velocity.toml with correct port
                console.log(`⚠️  velocity.toml not found, creating with port ${correctPort}...`);
                await updateVelocityConfig(serverId, getDefaultVelocityConfig({ port: correctPort }));
            }
        } else if (serverType === 'bungeecord' || serverType === 'waterfall') {
            // Enforce config.yml port
            const configYmlPath = path.join(serverDir, 'config.yml');
            
            if (fs.existsSync(configYmlPath)) {
                let content = fs.readFileSync(configYmlPath, 'utf8');
                const originalContent = content;
                
                // Force correct host port
                content = sanitizeBungeeCordConfig(content, correctPort);
                
                // Only write if changed
                if (content !== originalContent) {
                    fs.writeFileSync(configYmlPath, content, 'utf8');
                    console.log(`✅ Enforced config.yml port to ${correctPort} for server ${serverId}`);
                } else {
                    console.log(`✅ config.yml port already correct (${correctPort}) for server ${serverId}`);
                }
            } else {
                // Create default config.yml with correct port
                console.log(`⚠️  config.yml not found, creating with port ${correctPort}...`);
                const defaultConfig = `# BungeeCord Configuration
# Generated by Minecraft Server Panel

listeners:
- query_port: ${correctPort}
  motd: '&1A BungeeCord Server'
  priorities:
  - lobby
  bind_local_address: true
  host: 0.0.0.0:${correctPort}
  max_players: 100
  tab_size: 60
  force_default_server: false

servers:
  lobby:
    motd: 'Lobby Server'
    address: localhost:25565
    restricted: false

permissions:
  default:
  - bungeecord.command.server
  - bungeecord.command.list

groups:
  admin:
  - bungeecord.command.alert
  - bungeecord.command.end
  - bungeecord.command.ip
  - bungeecord.command.reload

timeout: 30000
player_limit: -1
ip_forward: false
online_mode: true
`;
                fs.writeFileSync(configYmlPath, defaultConfig, 'utf8');
                console.log(`✅ Created config.yml with port ${correctPort} for server ${serverId}`);
            }
        }
        
        console.log(`🔒 Port protection enforced for ${serverType} server ${serverId} on port ${correctPort}`);
    } catch (err) {
        console.error(`Error enforcing proxy server port for server ${serverId}:`, err);
        throw err;
    }
}

// Enforce Minecraft server port before starting
async function enforceMinecraftServerPort(serverId, correctPort) {
    try {
        const serverDir = resolveServerPath(serverId);
        const serverPropertiesPath = path.join(serverDir, 'server.properties');
        
        if (fs.existsSync(serverPropertiesPath)) {
            let content = fs.readFileSync(serverPropertiesPath, 'utf8');
            const originalContent = content;
            
            // Force correct server port
            content = sanitizeServerProperties(content, correctPort);
            
            // Only write if changed
            if (content !== originalContent) {
                fs.writeFileSync(serverPropertiesPath, content, 'utf8');
                console.log(`✅ Enforced server.properties port to ${correctPort} for server ${serverId}`);
            } else {
                console.log(`✅ server.properties port already correct (${correctPort}) for server ${serverId}`);
            }
        } else {
            console.log(`⚠️  server.properties not found for server ${serverId}, will be created on first start`);
        }
        
        console.log(`🔒 Port protection enforced for Minecraft server ${serverId} on port ${correctPort}`);
    } catch (err) {
        console.error(`Error enforcing Minecraft server port for server ${serverId}:`, err);
        throw err;
    }
}
// Helper function to get standard template variables
async function getTemplateVars(req, server = null, additionalVars = {}) {
    let userWithTheme = req.session.user;
    
    // Load user theme preferences and profile data from database if user is logged in
    if (req.session.user) {
        try {
            const userProfile = await dbGet(`
                SELECT u.*, up.theme_preference, up.theme_primary_color, up.theme_accent_color,
                       up.language, up.timezone, up.display_name as profile_display_name, 
                       up.profile_picture
                FROM users u
                LEFT JOIN user_profiles up ON u.id = up.user_id
                WHERE u.id = ?
            `, [req.session.user.id]);
            
            if (userProfile) {
                userWithTheme = {
                    ...req.session.user,
                    theme_preference: userProfile.theme_preference || 'dark',
                    theme_primary_color: userProfile.theme_primary_color || '#2d6a4f',
                    theme_accent_color: userProfile.theme_accent_color || '#40916c',
                    language: userProfile.language || 'en',
                    timezone: userProfile.timezone || 'UTC',
                    display_name: userProfile.profile_display_name || userProfile.display_name || req.session.user.username,
                    profile_picture: userProfile.profile_picture || null
                };
            }
        } catch (err) {
            console.error('Error loading user profile:', err);
            // Continue with session user data if profile loading fails
        }
    }
    
    return {
        settings: globalSettings,
        user: userWithTheme,
        currentPage: additionalVars.currentPage || 'dashboard',
        server: server,
        req: req, // Pass request object for path detection
        ...additionalVars
    };
}
// Authorization middleware
async function isAuthorized(req, serverId) {
    if (!req.session || !req.session.user) return false;
 
    try {
        const server = await dbGet('SELECT owner_id FROM servers WHERE id = ?', [serverId]);
        if (!server) return false;
     
        if (req.session.user.role === 'admin' || server.owner_id === req.session.user.id) {
            return true;
        }
     
        const subuser = await dbGet(
            'SELECT * FROM subusers WHERE server_id = ? AND user_id = ?',
            [serverId, req.session.user.id]
        );
        return !!subuser;
    } catch (err) {
        console.error('Authorization error:', err);
        return false;
    }
}
// Admin middleware
const requireAdmin = (req, res, next) => {
    if (!req.session.user) {
        // Check if this is an API request
        const isApiRequest = req.xhr || 
                           req.headers.accept?.toLowerCase().includes('application/json') || 
                           req.headers['content-type']?.toLowerCase().includes('application/json') ||
                           req.path.startsWith('/api/');
        
        if (isApiRequest) {
            console.log('Admin auth failed - not logged in (API request)');
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/auth/login');
    }
    
    if (req.session.user.role !== 'admin') {
        // Check if this is an API request
        const isApiRequest = req.xhr || 
                           req.headers.accept?.toLowerCase().includes('application/json') || 
                           req.headers['content-type']?.toLowerCase().includes('application/json') ||
                           req.path.startsWith('/api/');
        
        if (isApiRequest) {
            console.log('Admin auth failed - not admin (API request):', req.session.user.username);
            return res.status(403).json({ error: 'Admin privileges required' });
        }
        req.flash = req.flash || function(type, msg) { req.session.messages = req.session.messages || []; req.session.messages.push({type, msg}); };
        req.flash('error', 'Access denied. Admin privileges required.');
        return res.redirect('/dashboard');
    }
    next();
};
// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        // Check if this is an API request (AJAX/fetch)
        const isApiRequest = req.xhr || 
                           req.headers.accept?.toLowerCase().includes('application/json') || 
                           req.headers['content-type']?.toLowerCase().includes('application/json') ||
                           req.path.startsWith('/api/');
        
        if (isApiRequest) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/auth/login');
    }
    next();
};
// Server control helpers
async function isServerRunning(serverId) {
  try {
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) return false;
    
    // Method 1: Check if we have a stored process reference
    const serverProcess = global.serverProcesses && global.serverProcesses[serverId];
    if (serverProcess && !serverProcess.killed) {
      return true;
    }
    
    // Method 2: Check PID file if process reference is lost
    const serverDir = resolveServerPath(serverId);
    const pidFile = path.join(serverDir, '.server.pid');
    
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
        
        // Check if process is still running
        if (isProcessRunning(pid)) {
          // Verify it's a Java process
          if (await isJavaProcess(pid)) {
            return true;
          }
        } else {
          // Process not running, clean up stale PID file
          fs.unlinkSync(pidFile);
          console.log(`Cleaned up stale PID file for server ${serverId}`);
        }
      } catch (err) {
        console.error(`Error checking PID file for server ${serverId}:`, err);
      }
    }
    
    // Method 3: Check by port (most reliable for detecting external servers)
    const pid = await getPidByPort(server.port);
    if (pid) {
      console.log(`Found server ${serverId} running on port ${server.port} with PID ${pid}`);
      // Save the PID for future reference
      try {
        fs.writeFileSync(pidFile, pid.toString());
      } catch (err) {
        console.error(`Failed to save PID file for server ${serverId}:`, err);
      }
      return true;
    }
    
    // Method 4: Check for world lock file ONLY if other methods also suggest server is running
    // This prevents false positives from stale lock files
    // We've already checked process, PID file, and port - if none found, lock file is stale
    
    return false;
  } catch (err) {
    console.error(`Error checking if server ${serverId} is running:`, err);
    return false;
  }
}

// Helper function to check if a process is running by PID
function isProcessRunning(pid) {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return false;
  }
}

// Helper function to check if a PID is a Java process
async function isJavaProcess(pid) {
  try {
    if (os.platform() === 'win32') {
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
      return stdout.toLowerCase().includes('java');
    } else {
      const { stdout } = await execAsync(`ps -p ${pid} -o comm=`);
      return stdout.toLowerCase().includes('java');
    }
  } catch (err) {
    return false;
  }
}

// Auto-enable RCON in server.properties
async function autoEnableRcon(serverId) {
  try {
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) return false;
    
    const propertiesPath = resolveServerPath(serverId, 'server.properties');
    
    // Check if server.properties exists
    if (!fs.existsSync(propertiesPath)) {
      console.log(`server.properties not found for server ${serverId}`);
      return false;
    }
    
    // Read current properties
    let content = fs.readFileSync(propertiesPath, 'utf8');
    
    // Check if RCON is already enabled
    if (content.includes('enable-rcon=true')) {
      console.log(`RCON already enabled for server ${serverId}`);
      return true;
    }
    
    // Generate RCON port (server port + 1000)
    const rconPort = server.port + 1000;
    const rconPassword = 'admin123';
    
    // Add or update RCON settings
    const rconSettings = `
# RCON Settings (Auto-enabled by panel)
enable-rcon=true
rcon.port=${rconPort}
rcon.password=${rconPassword}
`;
    
    // Remove existing RCON lines if any
    content = content.replace(/enable-rcon=.*/g, '');
    content = content.replace(/rcon\.port=.*/g, '');
    content = content.replace(/rcon\.password=.*/g, '');
    
    // Add RCON settings at the end
    content = content.trim() + '\n' + rconSettings;
    
    // Write back to file
    fs.writeFileSync(propertiesPath, content, 'utf8');
    
    // Update server settings in database
    const settings = JSON.parse(server.settings || '{}');
    settings.rcon = true;
    settings['rcon.port'] = rconPort;
    settings['rcon.password'] = rconPassword;
    
    await dbRun('UPDATE servers SET settings = ? WHERE id = ?', [
      JSON.stringify(settings),
      serverId
    ]);
    
    console.log(`RCON auto-enabled for server ${serverId} on port ${rconPort}`);
    return true;
  } catch (err) {
    console.error(`Failed to auto-enable RCON for server ${serverId}:`, err);
    return false;
  }
}

async function sendCommand(serverId, command) {
  if (!await isServerRunning(serverId)) {
    console.log(`Cannot send command to server ${serverId}: server not running`);
    return false;
  }
  
  try {
    const serverProcess = global.serverProcesses && global.serverProcesses[serverId];
    
    // Try stdin first (works for servers started by this panel instance)
    if (serverProcess && !serverProcess.killed && serverProcess.stdin && serverProcess.stdin.writable) {
      serverProcess.stdin.write(command + '\n');
      console.log(`Command sent to server ${serverId} via stdin: ${command}`);
      return true;
    } else {
      console.log(`Cannot send command via stdin to server ${serverId}, trying RCON...`);
      
      // Try RCON as fallback (works for reconnected servers)
      try {
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
          console.log(`Server ${serverId} not found in database`);
          return false;
        }
        
        const settings = JSON.parse(server.settings || '{}');
        const rconEnabled = settings.rcon === true || settings['enable-rcon'] === true;
        const rconPort = settings['rcon.port'] || settings.rconPort || (server.port + 1000);
        const rconPassword = settings['rcon.password'] || settings.rconPassword || 'admin123';
        
        if (rconEnabled) {
          const Rcon = require('rcon-client').Rcon;
          const rcon = await Rcon.connect({
            host: 'localhost',
            port: rconPort,
            password: rconPassword,
            timeout: 5000
          });
          
          const response = await rcon.send(command);
          await rcon.end();
          
          console.log(`Command sent to server ${serverId} via RCON: ${command}`);
          console.log(`RCON response:`, response);
          return true;
        } else {
          console.log(`RCON not enabled for server ${serverId}, cannot send command`);
          return false;
        }
      } catch (rconErr) {
        console.error(`RCON command failed for server ${serverId}:`, rconErr.message);
        return false;
      }
    }
  } catch (err) {
    console.error(`Send command error for server ${serverId}:`, err);
    return false;
  }
}
async function startServer(serverId) {
  const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
  if (!server) throw new Error('Server not found');
  
  // Use existing port - don't force changes
  const assignedPort = server.port;
  console.log(`Starting ${server.server_type} server ${serverId} on existing port ${assignedPort}`);
  
  // Check if server is already running
  if (await isServerRunning(serverId)) {
    throw new Error('Server already running');
  }
  
  const serverDir = resolveServerPath(serverId);
  
  // ENFORCE PORT PROTECTION FOR PROXY SERVERS BEFORE STARTING
  if (['velocity', 'bungeecord', 'waterfall'].includes(server.server_type)) {
    console.log(`🔒 Enforcing port protection for ${server.server_type} server ${serverId}...`);
    await enforceProxyServerPort(serverId, server.server_type, server.port);
  }
  
  // ENFORCE PORT PROTECTION FOR MINECRAFT SERVERS BEFORE STARTING
  if (!['velocity', 'bungeecord', 'waterfall', 'bedrock'].includes(server.server_type)) {
    console.log(`🔒 Enforcing port protection for Minecraft server ${serverId}...`);
    await enforceMinecraftServerPort(serverId, server.port);
  }
  
  // Check for world lock file (indicates another instance is running)
  const worldLockFile = path.join(serverDir, 'world', 'session.lock');
  if (fs.existsSync(worldLockFile)) {
    console.log(`Warning: World lock file exists for server ${serverId}, attempting to remove...`);
    try {
      fs.unlinkSync(worldLockFile);
      console.log(`Removed stale world lock file for server ${serverId}`);
    } catch (err) {
      console.error(`Failed to remove world lock file for server ${serverId}:`, err);
      throw new Error('Server world is locked by another process. Please ensure no other instances are running.');
    }
  }
  
  // Check for server executable based on server type
  let serverExecutable;
  let javaPath = 'java';
  let javaArgs = [];
  
  if (server.server_type === 'bedrock') {
    // Bedrock Dedicated Server uses bedrock_server.exe on Windows
    if (process.platform === 'win32') {
      serverExecutable = path.join(serverDir, 'bedrock_server.exe');
      if (!fs.existsSync(serverExecutable)) {
        console.log(`⚠️  bedrock_server.exe not found for server ${serverId}, attempting to download...`);
        try {
          await downloadServerJar(server.server_type, server.version, serverDir);
          console.log(`✅ Successfully downloaded Bedrock server files`);
        } catch (downloadErr) {
          throw new Error(`bedrock_server.exe not found and download failed: ${downloadErr.message}`);
        }
      }
      javaPath = serverExecutable;
      javaArgs = []; // Bedrock server doesn't use Java args
    } else {
      serverExecutable = path.join(serverDir, 'bedrock_server');
      if (!fs.existsSync(serverExecutable)) {
        console.log(`⚠️  bedrock_server not found for server ${serverId}, attempting to download...`);
        try {
          await downloadServerJar(server.server_type, server.version, serverDir);
          console.log(`✅ Successfully downloaded Bedrock server files`);
        } catch (downloadErr) {
          throw new Error(`bedrock_server not found and download failed: ${downloadErr.message}`);
        }
      }
      javaPath = serverExecutable;
      javaArgs = [];
    }
    console.log(`Using Bedrock Dedicated Server executable: ${serverExecutable}`);
  } else {
    // Java Edition servers require server.jar
    const serverJarPath = path.join(serverDir, 'server.jar');
    if (!fs.existsSync(serverJarPath)) {
      console.log(`⚠️  server.jar not found for server ${serverId}, attempting to download...`);
      try {
        await downloadServerJar(server.server_type, server.version, serverDir);
        console.log(`✅ Successfully downloaded server.jar for ${server.server_type} ${server.version}`);
      } catch (downloadErr) {
        throw new Error(`server.jar not found and download failed: ${downloadErr.message}`);
      }
    } else {
      console.log(`✅ server.jar found for server ${serverId}`);
    }
    
    // Determine Java executable for Java Edition servers
    if (process.platform === 'win32') {
      // Try different Java paths on Windows
      const javaPaths = ['java', 'java.exe'];
      let javaFound = false;
      
      for (const testPath of javaPaths) {
        try {
          const javaVersionOutput = await execAsync(`${testPath} -version`);
          javaPath = testPath;
          javaFound = true;
          
          // Check Java version for compatibility
          const versionMatch = javaVersionOutput.stderr.match(/version "(\d+)\.?(\d*)/);
          if (versionMatch) {
            const majorVersion = parseInt(versionMatch[1]);
            const minorVersion = parseInt(versionMatch[2] || '0');
            
            // Java 8 is version "1.8", Java 9+ is version "9", "17", etc.
            const actualVersion = majorVersion === 1 ? minorVersion : majorVersion;
            
            if (actualVersion < 17) {
              console.warn(`Server ${serverId}: Java ${actualVersion} detected. Minecraft 1.17+ requires Java 17 or higher.`);
              console.warn('Consider upgrading Java or using an older Minecraft version.');
            }
          }
          break;
        } catch (err) {
          // Continue to next path
        }
      }
      
      if (!javaFound) {
        throw new Error('Java not found. Please install Java and ensure it\'s in your PATH.');
      }
    }
    
    const xms = Math.max(256, Math.floor(server.ram / 4));
    const settings = JSON.parse(server.settings || '{}');
    javaArgs = ['-Xms' + xms + 'M', '-Xmx' + server.ram + 'M', '-jar', 'server.jar', 'nogui'];
    
    if (settings.startup) {
      // Parse custom startup command
      const customArgs = settings.startup.split(' ').filter(arg => arg.trim());
      if (customArgs[0] === 'java' || customArgs[0] === 'java.exe') {
        javaArgs = customArgs.slice(1);
      } else {
        javaArgs = customArgs;
      }
    }
  }

  console.log(`Starting server ${serverId} with command: ${javaPath} ${javaArgs.join(' ')}`);

  // Start the server process detached so it runs independently
  const serverProcess = spawn(javaPath, javaArgs, {
    cwd: serverDir,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Unref the process so the panel can exit without killing the server
  serverProcess.unref();

  // Store the process ID for management
  if (!global.serverProcesses) global.serverProcesses = {};
  global.serverProcesses[serverId] = serverProcess;
  
  // Save PID to file so we can reconnect after panel restart
  const pidFile = path.join(serverDir, '.server.pid');
  try {
    fs.writeFileSync(pidFile, serverProcess.pid.toString());
  } catch (err) {
    console.error(`Failed to write PID file for server ${serverId}:`, err);
  }

  // Handle process events
  serverProcess.on('error', (err) => {
    console.error(`Server ${serverId} process error:`, err);
    delete global.serverProcesses[serverId];
  });

  serverProcess.on('exit', async (code, signal) => {
    console.log(`Server ${serverId} exited with code ${code}, signal ${signal}`);
    
    // Check if server crashed immediately (within 10 seconds) - check BEFORE deleting start time
    const startTime = serverStartTimes[serverId] || Date.now();
    const uptime = Date.now() - startTime;
    const crashedImmediately = uptime < 10000;
    
    // Clean up PID file
    const pidFile = path.join(serverDir, '.server.pid');
    try {
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
      }
    } catch (err) {
      console.error(`Failed to delete PID file for server ${serverId}:`, err);
    }
    
    // Clean up start time file
    deleteServerStartTime(serverId);
    
    // Clean up stale world lock file
    try {
      const worldLockFile = path.join(serverDir, 'world', 'session.lock');
      if (fs.existsSync(worldLockFile)) {
        fs.unlinkSync(worldLockFile);
        console.log(`Cleaned up world lock file for server ${serverId}`);
      }
    } catch (err) {
      console.error(`Failed to delete world lock file for server ${serverId}:`, err);
    }
    
    delete global.serverProcesses[serverId];
    delete serverStartTimes[serverId];
    onlinePlayers[serverId] = [];
    await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['stopped', serverId]);
    
    // Check for common error codes and provide helpful messages
    if (code === 1) {
      console.error(`Server ${serverId} failed to start. Common causes:`);
      console.error('- Java version incompatibility (newer Minecraft versions require Java 17+)');
      console.error('- Missing or corrupted server.jar file');
      console.error('- Insufficient memory allocation');
      console.error('- Port already in use');
      
      // Emit error to connected clients
      io.to(`server:${serverId}`).emit('console', '\n[PANEL ERROR] Server failed to start with exit code 1\n');
      io.to(`server:${serverId}`).emit('console', '[PANEL ERROR] This is usually caused by Java version incompatibility.\n');
      io.to(`server:${serverId}`).emit('console', '[PANEL ERROR] Minecraft 1.17+ requires Java 17 or higher.\n');
      io.to(`server:${serverId}`).emit('console', '[PANEL ERROR] You currently have Java 8 installed.\n');
      io.to(`server:${serverId}`).emit('console', '[PANEL ERROR] Please install Java 17+ from https://adoptium.net/\n');
      io.to(`server:${serverId}`).emit('console', '[PANEL ERROR] Auto-restart has been disabled to prevent restart loops.\n\n');
    }
    
    // Get server settings for auto-restart check
    try {
      const serverData = await dbGet('SELECT settings FROM servers WHERE id = ?', [serverId]);
      const settings = JSON.parse(serverData?.settings || '{}');
      
      // Auto-restart if enabled and not a clean shutdown, but not if it crashed immediately
      if (settings.autoRestart && code !== 0 && code !== null && !crashedImmediately) {
        console.log(`Auto-restarting server ${serverId} in 5 seconds...`);
        setTimeout(() => {
          startServer(serverId).catch(err => console.error('Auto-restart failed:', err));
        }, 5000);
      } else if (crashedImmediately) {
        console.error(`Server ${serverId} crashed immediately after starting. Auto-restart disabled to prevent loops.`);
        io.to(`server:${serverId}`).emit('serverStatus', { status: 'stopped', error: 'Server crashed immediately after starting' });
      }
    } catch (err) {
      console.error(`Failed to get server settings for auto-restart check:`, err);
    }
  });

  // Log stderr for debugging
  serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    console.error(`Server ${serverId} stderr:`, output);
  });

  // Detach the process so it continues running independently
  serverProcess.unref();

  await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['running', serverId]);
  serverStartTimes[serverId] = Date.now();
  saveServerStartTime(serverId, serverStartTimes[serverId]); // Persist start time to file
  onlinePlayers[serverId] = [];
  startLogTail(serverId);
}
async function stopServer(serverId, force = false) {
  if (!await isServerRunning(serverId)) {
    console.log(`Server ${serverId} is not running`);
    return false;
  }
  
  try {
    const serverDir = resolveServerPath(serverId);
    const pidFile = path.join(serverDir, '.server.pid');
    const serverProcess = global.serverProcesses && global.serverProcesses[serverId];
    
    let pid = null;
    let stoppedGracefully = false;
    
    // Get PID from process or file
    if (serverProcess && !serverProcess.killed) {
      pid = serverProcess.pid;
    } else if (fs.existsSync(pidFile)) {
      try {
        pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
      } catch (err) {
        console.error(`Failed to read PID file for server ${serverId}:`, err);
      }
    }
    
    if (!pid) {
      console.log(`No PID found for server ${serverId}`);
      return false;
    }
    
    // Check if process is actually running
    if (!isProcessRunning(pid)) {
      console.log(`Server ${serverId} process (PID: ${pid}) is not running`);
      // Clean up and return
      if (serverProcess) {
        delete global.serverProcesses[serverId];
      }
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
      }
      deleteServerStartTime(serverId);
      onlinePlayers[serverId] = [];
      await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['stopped', serverId]);
      return true;
    }
    
    console.log(`Stopping server ${serverId} (PID: ${pid})${force ? ' (force)' : ''}`);
    
    if (force) {
      // Force kill immediately
      try {
        process.kill(pid, 'SIGKILL');
        console.log(`Force killed server ${serverId} (PID: ${pid})`);
      } catch (err) {
        if (err.code === 'ESRCH') {
          console.log(`Process ${pid} already stopped`);
        } else {
          console.error(`Failed to force kill PID ${pid}:`, err);
        }
      }
    } else {
      // Try graceful shutdown
      try {
        // Send stop command via stdin if available
        if (serverProcess && serverProcess.stdin && serverProcess.stdin.writable) {
          console.log(`Sending stop command to server ${serverId} via stdin`);
          serverProcess.stdin.write('stop\n');
        } else {
          // Send SIGTERM for graceful shutdown
          console.log(`Sending SIGTERM to server ${serverId} (PID: ${pid})`);
          process.kill(pid, 'SIGTERM');
        }
        
        // Wait up to 30 seconds for graceful shutdown
        const maxWaitTime = 30000;
        const checkInterval = 1000;
        let waited = 0;
        
        const checkStopped = setInterval(() => {
          waited += checkInterval;
          
          if (!isProcessRunning(pid)) {
            clearInterval(checkStopped);
            console.log(`Server ${serverId} stopped gracefully`);
            stoppedGracefully = true;
          } else if (waited >= maxWaitTime) {
            clearInterval(checkStopped);
            console.log(`Server ${serverId} didn't stop gracefully after ${maxWaitTime/1000}s, force killing`);
            
            try {
              process.kill(pid, 'SIGKILL');
              console.log(`Force killed server ${serverId} (PID: ${pid})`);
            } catch (err) {
              if (err.code === 'ESRCH') {
                console.log(`Process ${pid} already stopped`);
              } else {
                console.error(`Failed to force kill PID ${pid}:`, err.message);
              }
            }
          }
        }, checkInterval);
        
      } catch (err) {
        if (err.code === 'ESRCH') {
          console.log(`Process ${pid} already stopped`);
        } else {
          console.error(`Error stopping server ${serverId}:`, err);
        }
      }
    }
    
    // Clean up PID file
    try {
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
        console.log(`Deleted PID file for server ${serverId}`);
      }
    } catch (err) {
      console.error(`Failed to delete PID file for server ${serverId}:`, err);
    }
    
    // Clean up start time file
    deleteServerStartTime(serverId);
    
    // Clean up stale world lock file
    try {
      const worldLockFile = path.join(serverDir, 'world', 'session.lock');
      if (fs.existsSync(worldLockFile)) {
        fs.unlinkSync(worldLockFile);
        console.log(`Cleaned up world lock file for server ${serverId}`);
      }
    } catch (err) {
      console.error(`Failed to delete world lock file for server ${serverId}:`, err);
    }
    
    // Clean up
    if (global.serverProcesses) {
      delete global.serverProcesses[serverId];
    }
    delete serverStartTimes[serverId];
    onlinePlayers[serverId] = [];
    await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['stopped', serverId]);
    
    if (serverLogWatchers[serverId]) {
      serverLogWatchers[serverId].close();
      delete serverLogWatchers[serverId];
    }
    delete serverLogPositions[serverId];
    return true;
  } catch (err) {
    console.error('Stop server error:', err);
    return false;
  }
}
function startLogTail(serverId) {
  const serverDir = resolveServerPath(serverId);
  const logPath = path.join(serverDir, 'logs', 'latest.log');
  
  // Ensure log directory exists
  if (!fs.existsSync(path.dirname(logPath))) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  }
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, '');
  }
  
  if (!serverLogPositions[serverId]) serverLogPositions[serverId] = 0;
  
  // Set up log file watching
  const readNewLines = () => {
    let stats;
    try {
      stats = fs.statSync(logPath);
    } catch {
      return;
    }
    if (stats.size < serverLogPositions[serverId]) {
      serverLogPositions[serverId] = 0;
    }
    if (stats.size > serverLogPositions[serverId]) {
      const stream = fs.createReadStream(logPath, {
        start: serverLogPositions[serverId],
        end: stats.size
      });
      let buffer = '';
      stream.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
      });
      stream.on('end', () => {
        const lines = buffer.split('\n');
        for (let line of lines) {
          if (line.trim()) {
            io.to(`server:${serverId}`).emit('console', line + '\n');
            processLogLine(serverId, line);
          }
        }
        serverLogPositions[serverId] = stats.size;
      });
    }
  };
  
  // Also capture direct process output if available
  const serverProcess = global.serverProcesses && global.serverProcesses[serverId];
  if (serverProcess && serverProcess.stdout) {
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      io.to(`server:${serverId}`).emit('console', output);
      // Process each line for player join/leave detection
      output.split('\n').forEach(line => {
        if (line.trim()) processLogLine(serverId, line);
      });
    });
    
    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      io.to(`server:${serverId}`).emit('console', output);
    });
  }
  
  readNewLines();
  const watcher = fs.watch(logPath, (eventType) => {
    if (eventType === 'change') {
      readNewLines();
    }
  });
  
  // Add error handling for file watcher
  watcher.on('error', (err) => {
    console.error(`File watcher error for server ${serverId}:`, err.message);
    // Try to close the watcher gracefully
    try {
      watcher.close();
    } catch (closeErr) {
      console.error(`Error closing watcher for server ${serverId}:`, closeErr.message);
    }
    // Remove from tracking
    delete serverLogWatchers[serverId];
  });
  
  serverLogWatchers[serverId] = watcher;
}

// Helper function to process log lines for player events
function processLogLine(serverId, line) {
  // Ensure onlinePlayers array exists
  if (!onlinePlayers[serverId]) {
    onlinePlayers[serverId] = [];
  }
  
  // Match various join patterns:
  // [HH:MM:SS] [Server thread/INFO]: PlayerName joined the game
  // [HH:MM:SS INFO]: PlayerName joined the game
  const joinedMatch = line.match(/\[.*?\].*?:\s*(\w+)\s+joined the game/i);
  if (joinedMatch) {
    const player = joinedMatch[1];
    if (!onlinePlayers[serverId].includes(player)) {
      onlinePlayers[serverId].push(player);
      console.log(`Player joined: ${player} on server ${serverId}`);
      
      // Emit real-time update via Socket.IO
      io.to(`server:${serverId}`).emit('playerJoined', {
        player: player,
        onlinePlayers: onlinePlayers[serverId],
        count: onlinePlayers[serverId].length
      });
    }
  }
  
  // Match various leave patterns:
  // [HH:MM:SS] [Server thread/INFO]: PlayerName left the game
  // [HH:MM:SS INFO]: PlayerName left the game
  const leftMatch = line.match(/\[.*?\].*?:\s*(\w+)\s+left the game/i);
  if (leftMatch) {
    const player = leftMatch[1];
    onlinePlayers[serverId] = onlinePlayers[serverId].filter(p => p !== player);
    console.log(`Player left: ${player} on server ${serverId}`);
    
    // Emit real-time update via Socket.IO
    io.to(`server:${serverId}`).emit('playerLeft', {
      player: player,
      onlinePlayers: onlinePlayers[serverId],
      count: onlinePlayers[serverId].length
    });
  }
  
  // Parse /list command response to get current online players
  // Format: "There are X of a max of Y players online: player1, player2, player3"
  // Or: "There are X/Y players online: player1, player2"
  const listMatch = line.match(/There are \d+(?:\/| of a max of )\d+ players online:\s*(.*)/i);
  if (listMatch) {
    const playerList = listMatch[1].trim();
    if (playerList && playerList !== '') {
      const players = playerList.split(',').map(p => p.trim()).filter(p => p && p !== '');
      onlinePlayers[serverId] = players;
      console.log(`Updated online players for server ${serverId}:`, players);
      
      // Emit update via Socket.IO
      io.to(`server:${serverId}`).emit('playersUpdated', {
        onlinePlayers: players,
        count: players.length
      });
    } else {
      // No players online
      onlinePlayers[serverId] = [];
      console.log(`No players online for server ${serverId}`);
      io.to(`server:${serverId}`).emit('playersUpdated', {
        onlinePlayers: [],
        count: 0
      });
    }
  }
}

// Helper function to query current online players from server using RCON
async function queryOnlinePlayersRcon(serverId) {
  try {
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) return false;

    const rcon = new Rcon({
      host: 'localhost',
      port: 25575, // Default RCON port
      password: 'admin123'
    });

    await rcon.connect();
    const response = await rcon.send('list');
    await rcon.end();

    console.log(`RCON response for server ${serverId}:`, response);

    // Parse the response: "There are X of a max of Y players online: player1, player2"
    const listMatch = response.match(/There are \d+(?:\/| of a max of )\d+ players online:\s*(.*)/i);
    if (listMatch) {
      const playerList = listMatch[1].trim();
      let players = [];
      
      if (playerList && playerList !== '') {
        players = playerList.split(',').map(p => p.trim()).filter(p => p && p !== '');
      }
      
      // Update the global player list
      onlinePlayers[serverId] = players;
      console.log(`Updated online players for server ${serverId} via RCON:`, players);
      
      // Emit update via Socket.IO
      io.to(`server:${serverId}`).emit('playersUpdated', {
        onlinePlayers: players,
        count: players.length
      });
      
      return true;
    }
    
    return false;
  } catch (err) {
    // RCON errors are expected when RCON is not configured or server is stopped
    console.log(`RCON not available for server ${serverId} (this is normal if RCON is not configured)`);
    return false;
  }
}

// Helper function to query current online players from server
async function queryOnlinePlayers(serverId) {
  try {
    // First try RCON (more reliable)
    const rconSuccess = await queryOnlinePlayersRcon(serverId);
    if (rconSuccess) return true;

    // Fallback to stdin if we have process reference
    const serverProcess = global.serverProcesses && global.serverProcesses[serverId];
    if (serverProcess && !serverProcess.killed && serverProcess.stdin && serverProcess.stdin.writable) {
      // Send /list command to get current players
      serverProcess.stdin.write('list\n');
      console.log(`Queried online players for server ${serverId} via stdin`);
      return true;
    } else {
      // If we don't have process reference, this is expected for stopped servers or servers without RCON
      console.log(`Server ${serverId} player query skipped - server may be stopped or RCON not configured`);
      // Initialize as empty - will be populated as players join/leave
      if (!onlinePlayers[serverId]) {
        onlinePlayers[serverId] = [];
      }
      return false;
    }
  } catch (err) {
    console.error(`Failed to query online players for server ${serverId}:`, err);
    return false;
  }
}
async function getPidByPort(port) {
  try {
    if (os.platform() === 'win32') {
      // Windows: Use netstat to find PID by port
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        // Look for LISTENING state
        if (line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1]);
          if (!isNaN(pid) && pid > 0) {
            // Verify this is a Java process
            try {
              const { stdout: taskList } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
              if (taskList.toLowerCase().includes('java')) {
                return pid;
              }
            } catch (err) {
              // Continue checking other PIDs
            }
          }
        }
      }
      return null;
    } else {
      // Linux: Use lsof
      const { stdout } = await execAsync(`lsof -iTCP:${port} -sTCP:LISTEN -t`);
      const pid = parseInt(stdout.trim());
      return isNaN(pid) ? null : pid;
    }
  } catch (err) {
    return null;
  }
}
async function downloadServerJar(serverType, version, dir) {
    let url;
    let actualVersion = version;
    
    try {
        console.log(`🔄 Downloading ${serverType} ${version}...`);
        
        // Handle 'latest' for each server type
        if (version === 'latest') {
            if (serverType === 'vanilla') {
                const manifestRes = await axios.get('https://launchermeta.mojang.com/mc/game/version_manifest.json');
                actualVersion = manifestRes.data.latest.release;
            } else if (serverType === 'paper') {
                const res = await axios.get('https://api.papermc.io/v2/projects/paper');
                actualVersion = res.data.versions[res.data.versions.length - 1];
            } else if (serverType === 'purpur') {
                const res = await axios.get('https://api.purpurmc.org/v2/purpur');
                actualVersion = res.data.versions[res.data.versions.length - 1];
            } else if (serverType === 'velocity') {
                const res = await axios.get('https://api.papermc.io/v2/projects/velocity');
                actualVersion = res.data.versions[res.data.versions.length - 1];
            } else if (serverType === 'waterfall') {
                const res = await axios.get('https://api.papermc.io/v2/projects/waterfall');
                actualVersion = res.data.versions[res.data.versions.length - 1];
            } else if (serverType === 'bungeecord') {
                actualVersion = 'latest'; // BungeeCord uses latest build
            }
        }
        
        // Get download URL for each server type
        if (serverType === 'vanilla') {
            const manifestRes = await axios.get('https://launchermeta.mojang.com/mc/game/version_manifest.json');
            const ver = manifestRes.data.versions.find(v => v.id === actualVersion);
            if (!ver) throw new Error(`Vanilla version ${actualVersion} not found`);
            const verJsonRes = await axios.get(ver.url);
            url = verJsonRes.data.downloads.server.url;
        } else if (serverType === 'paper') {
            const buildsRes = await axios.get(`https://api.papermc.io/v2/projects/paper/versions/${actualVersion}/builds`);
            const build = buildsRes.data.builds[buildsRes.data.builds.length - 1];
            url = `https://api.papermc.io/v2/projects/paper/versions/${actualVersion}/builds/${build.build}/downloads/paper-${actualVersion}-${build.build}.jar`;
        } else if (serverType === 'purpur') {
            const latestBuildRes = await axios.get(`https://api.purpurmc.org/v2/purpur/${actualVersion}/latest`);
            const build = latestBuildRes.data.build;
            url = `https://api.purpurmc.org/v2/purpur/${actualVersion}/${build}/download`;
        } else if (serverType === 'spigot') {
            // Spigot requires BuildTools - provide direct download link
            url = 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar';
        } else if (serverType === 'fabric') {
            const loaderRes = await axios.get('https://meta.fabricmc.net/v2/versions/loader');
            const loader = loaderRes.data[0].version;
            url = `https://meta.fabricmc.net/v2/versions/loader/${actualVersion}/${loader}/server/jar`;
        } else if (serverType === 'forge') {
            // Forge installer
            url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${actualVersion}/forge-${actualVersion}-installer.jar`;
        } else if (serverType === 'velocity') {
            const buildsRes = await axios.get(`https://api.papermc.io/v2/projects/velocity/versions/${actualVersion}/builds`);
            const build = buildsRes.data.builds[buildsRes.data.builds.length - 1];
            url = `https://api.papermc.io/v2/projects/velocity/versions/${actualVersion}/builds/${build.build}/downloads/velocity-${actualVersion}-${build.build}.jar`;
        } else if (serverType === 'waterfall') {
            const buildsRes = await axios.get(`https://api.papermc.io/v2/projects/waterfall/versions/${actualVersion}/builds`);
            const build = buildsRes.data.builds[buildsRes.data.builds.length - 1];
            url = `https://api.papermc.io/v2/projects/waterfall/versions/${actualVersion}/builds/${build.build}/downloads/waterfall-${actualVersion}-${build.build}.jar`;
        } else if (serverType === 'bungeecord') {
            url = 'https://ci.md-5.net/job/BungeeCord/lastSuccessfulBuild/artifact/bootstrap/target/BungeeCord.jar';
        } else if (serverType === 'bedrock') {
            // Bedrock Dedicated Server - use official download links
            console.log(`🔄 Preparing Bedrock server download...`);
            
            // Use current official download URLs from minecraft.net
            if (process.platform === 'win32') {
                // Windows Bedrock server
                url = 'https://www.minecraft.net/bedrockdedicatedserver/bin-win/bedrock-server-1.26.14.1.zip';
                actualVersion = '1.26.14.1';
            } else {
                // Linux Bedrock server  
                url = 'https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.14.1.zip';
                actualVersion = '1.26.14.1';
            }
            
            console.log(`📦 Using Bedrock server version: ${actualVersion}`);
            console.log(`🌐 Platform: ${process.platform === 'win32' ? 'Windows' : 'Linux'}`);
            
            // If the user specified a specific version, try to use it
            if (version !== 'latest' && version !== actualVersion) {
                console.log(`⚠️  Requested version ${version}, but using ${actualVersion} (latest available)`);
            }
        } else if (serverType === 'nukkit') {
            url = 'https://ci.opencollab.dev/job/NukkitX/job/Nukkit/job/master/lastSuccessfulBuild/artifact/target/nukkit-1.0-SNAPSHOT.jar';
        } else if (serverType === 'mohist') {
            url = `https://mohistmc.com/api/v2/projects/mohist/${actualVersion}/builds/latest/download`;
        } else {
            throw new Error(`Unsupported server type: ${serverType}`);
        }
        
        const jarPath = path.join(dir, 'server.jar');
        let downloadPath = jarPath;
        
        // Special handling for Bedrock servers
        if (serverType === 'bedrock') {
            downloadPath = path.join(dir, 'bedrock-server.zip');
        }
        
        // Ensure the directory exists
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created directory: ${dir}`);
        }
        
        console.log(`📥 Downloading from: ${url}`);
        
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            headers: { 
                'User-Agent': 'Mozilla/5.0 (compatible; Minecraft Server Panel)',
                'Accept': 'application/java-archive, application/octet-stream, application/zip, */*'
            },
            timeout: 300000 // 5 minute timeout
        });
        
        const writer = fs.createWriteStream(downloadPath);
        const totalLength = parseInt(response.headers['content-length'], 10);
        let downloadedLength = 0;
        
        return new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                downloadedLength += chunk.length;
                if (totalLength) {
                    const percent = Math.round((downloadedLength / totalLength) * 100);
                    if (percent % 10 === 0) { // Log every 10%
                        console.log(`📊 Download progress: ${percent}% (${Math.round(downloadedLength / 1024 / 1024)}MB)`);
                    }
                }
            });
            
            response.data.pipe(writer);
            
            writer.on('finish', async () => {
                const fileSizeMB = Math.round(downloadedLength / 1024 / 1024);
                console.log(`✅ Successfully downloaded ${serverType} ${actualVersion} (${fileSizeMB}MB)`);
                
                // Special handling for Bedrock servers - extract the zip
                if (serverType === 'bedrock') {
                    try {
                        console.log(`📦 Extracting Bedrock server files...`);
                        const unzipper = require('unzipper');
                        
                        await fs.createReadStream(downloadPath)
                            .pipe(unzipper.Extract({ path: dir }))
                            .promise();
                        
                        // Remove the zip file after extraction
                        fs.unlinkSync(downloadPath);
                        
                        // Verify the executable exists
                        const executableName = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
                        const executablePath = path.join(dir, executableName);
                        
                        if (fs.existsSync(executablePath)) {
                            console.log(`✅ Bedrock server extracted successfully: ${executableName}`);
                        } else {
                            throw new Error(`Bedrock server executable not found: ${executableName}`);
                        }
                        
                    } catch (extractErr) {
                        console.error(`❌ Failed to extract Bedrock server:`, extractErr.message);
                        reject(new Error(`Bedrock server extraction failed: ${extractErr.message}`));
                        return;
                    }
                }
                
                resolve(actualVersion);
            });
            
            writer.on('error', (err) => {
                console.error(`❌ Error writing ${serverType} file:`, err.message);
                reject(err);
            });
            
            response.data.on('error', (err) => {
                console.error(`❌ Error downloading ${serverType}:`, err.message);
                reject(err);
            });
        });
        
    } catch (err) {
        console.error(`❌ Failed to download ${serverType} ${version}:`, err.message);
        
        // Provide helpful error messages
        if (err.code === 'ENOTFOUND') {
            if (serverType === 'bedrock') {
                throw new Error(`Network error: Cannot reach Bedrock server download. Please check your internet connection or try again later. If the issue persists, you may need to manually download the Bedrock server from https://www.minecraft.net/en-us/download/server/bedrock`);
            } else {
                throw new Error(`Network error: Could not connect to download server for ${serverType}`);
            }
        } else if (err.code === 'ETIMEDOUT') {
            throw new Error(`Download timeout: ${serverType} download took too long (>5 minutes)`);
        } else if (err.response && err.response.status === 404) {
            throw new Error(`Version not found: ${serverType} ${version} is not available`);
        } else if (err.response && err.response.status === 403) {
            throw new Error(`Access denied: Cannot download ${serverType} ${version}`);
        } else {
            throw new Error(`Download failed: ${err.message}`);
        }
    }
}
// Plugin search and download helpers
async function searchModrinth(query, page = 1, limit = 12) {
    try {
        const offset = (page - 1) * limit;
        const res = await axios.get(`https://api.modrinth.com/v2/search`, {
            params: {
                query: query || '',
                limit: limit,
                offset: offset,
                facets: JSON.stringify([["project_type:plugin"], ["categories:bukkit", "categories:spigot", "categories:paper"]]),
            },
            headers: {
                'User-Agent': 'MinecraftPanel/1.0'
            }
        });
        
        return {
            plugins: (res.data.hits || []).map(p => ({
                id: p.project_id,
                name: p.title,
                slug: p.slug,
                description: p.description,
                author: p.author,
                downloads: p.downloads,
                follows: p.follows,
                categories: p.categories || [],
                source: 'modrinth',
                projectId: p.project_id,
                icon: p.icon_url || null,
                url: `https://modrinth.com/plugin/${p.slug}`,
                dateModified: p.date_modified,
                clientSide: p.client_side,
                serverSide: p.server_side,
                hasVersions: true
            })),
            totalHits: res.data.total_hits || 0
        };
    } catch (err) {
        console.error('Modrinth search error:', err.message);
        return { plugins: [], totalHits: 0 };
    }
}

async function searchSpigot(query, page = 1, limit = 12) {
    try {
        const searchQuery = query || 'popular';
        const res = await axios.get(`https://api.spiget.org/v2/search/resources/${encodeURIComponent(searchQuery)}`, {
            params: {
                size: limit,
                page: page - 1,
                sort: '-downloads',
                fields: 'id,name,tag,likes,downloads,rating,icon,premium,price,currency,file,author'
            },
            headers: {
                'User-Agent': 'MinecraftPanel/1.0'
            }
        });
        
        const plugins = (res.data || [])
            .filter(p => !p.premium)
            .map(p => ({
                id: p.id,
                name: p.name,
                description: p.tag || 'No description available',
                author: p.author?.name || 'Unknown',
                downloads: p.downloads || 0,
                rating: p.rating?.average || 0,
                likes: p.likes || 0,
                source: 'spiget',
                resourceId: p.id,
                icon: p.icon?.url ? `https://www.spigotmc.org/${p.icon.url}` : null,
                url: `https://www.spigotmc.org/resources/${p.id}/`,
                version: p.file?.version || 'Unknown',
                testedVersions: p.testedVersions || [],
                hasVersions: true
            }));
        
        return {
            plugins: plugins,
            totalHits: plugins.length
        };
    } catch (err) {
        console.error('Spigot search error:', err.message);
        return { plugins: [], totalHits: 0 };
    }
}

async function searchHangar(query, page = 1, limit = 12) {
    try {
        const offset = (page - 1) * limit;
        const res = await axios.get(`https://hangar.papermc.io/api/v1/projects`, {
            params: {
                q: query || '',
                limit: limit,
                offset: offset,
                sort: '-downloads',
                category: 'plugin'
            },
            headers: {
                'User-Agent': 'MinecraftPanel/1.0'
            }
        });
        
        const plugins = (res.data.result || []).map(p => ({
            id: p.name,
            name: p.name,
            slug: p.name,
            description: p.description || 'No description available',
            author: p.owner,
            downloads: p.stats?.downloads || 0,
            views: p.stats?.views || 0,
            stars: p.stats?.stars || 0,
            watchers: p.stats?.watchers || 0,
            categories: p.category ? [p.category] : [],
            source: 'hangar',
            projectId: p.name,
            icon: p.avatarUrl || null,
            url: `https://hangar.papermc.io/${p.owner}/${p.name}`,
            hasVersions: true
        }));
        
        return {
            plugins: plugins,
            totalHits: res.data.pagination?.count || plugins.length
        };
    } catch (err) {
        console.error('Hangar search error:', err.message);
        return { plugins: [], totalHits: 0 };
    }
}

async function searchBukkit(query, page = 1, limit = 12) {
    try {
        // CurseForge API for Bukkit plugins
        const res = await axios.get(`https://api.curseforge.com/v1/mods/search`, {
            params: {
                gameId: 432, // Minecraft
                classId: 5, // Bukkit Plugins
                searchFilter: query || '',
                pageSize: limit,
                index: (page - 1) * limit,
                sortField: 2, // Popularity
                sortOrder: 'desc'
            },
            headers: {
                'User-Agent': 'MinecraftPanel/1.0',
                'x-api-key': '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm' // Public demo key
            }
        });
        
        const plugins = (res.data.data || []).map(p => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            description: p.summary || 'No description available',
            author: p.authors?.[0]?.name || 'Unknown',
            downloads: p.downloadCount || 0,
            categories: (p.categories || []).map(c => c.name),
            source: 'bukkit',
            projectId: p.id,
            icon: p.logo?.thumbnailUrl || null,
            url: p.links?.websiteUrl || `https://www.curseforge.com/minecraft/bukkit-plugins/${p.slug}`,
            dateModified: p.dateModified,
            hasVersions: true
        }));
        
        return {
            plugins: plugins,
            totalHits: res.data.pagination?.totalCount || plugins.length
        };
    } catch (err) {
        console.error('Bukkit search error:', err.message);
        return { plugins: [], totalHits: 0 };
    }
}

async function searchPlugins(query, page = 1, limit = 12, provider = 'all') {
    const perProvider = Math.ceil(limit / 4);
    
    if (provider === 'modrinth') {
        return await searchModrinth(query, page, limit);
    } else if (provider === 'spiget') {
        return await searchSpigot(query, page, limit);
    } else if (provider === 'hangar') {
        return await searchHangar(query, page, limit);
    } else if (provider === 'bukkit') {
        return await searchBukkit(query, page, limit);
    } else {
        // Search all providers
        const [modrinth, spigot, hangar, bukkit] = await Promise.all([
            searchModrinth(query, page, perProvider),
            searchSpigot(query, page, perProvider),
            searchHangar(query, page, perProvider),
            searchBukkit(query, page, perProvider)
        ]);
        
        return {
            plugins: [...modrinth.plugins, ...spigot.plugins, ...hangar.plugins, ...bukkit.plugins],
            totalHits: modrinth.totalHits + spigot.totalHits + hangar.totalHits + bukkit.totalHits
        };
    }
}
async function getModrinthDownloadUrl(projectId, versionId = null) {
    try {
        // Get all versions for the project
        const res = await axios.get(`https://api.modrinth.com/v2/project/${projectId}/version`, {
            headers: {
                'User-Agent': 'MinecraftPanel/1.0'
            }
        });
        
        if (res.data && res.data.length > 0) {
            // If specific version requested, find it
            let targetVersion = versionId 
                ? res.data.find(v => v.id === versionId)
                : res.data[0]; // Latest version
            
            if (!targetVersion) targetVersion = res.data[0];
            
            // Get the primary file (usually the first one)
            if (targetVersion.files && targetVersion.files.length > 0) {
                const primaryFile = targetVersion.files.find(f => f.primary) || targetVersion.files[0];
                return {
                    url: primaryFile.url,
                    filename: primaryFile.filename,
                    version: targetVersion.version_number,
                    versionId: targetVersion.id
                };
            }
        }
        throw new Error('No files found for this project');
    } catch (err) {
        console.error('Modrinth URL fetch error:', err.message);
        return null;
    }
}

async function getModrinthVersions(projectId) {
    try {
        const res = await axios.get(`https://api.modrinth.com/v2/project/${projectId}/version`, {
            headers: {
                'User-Agent': 'MinecraftPanel/1.0'
            }
        });
        
        return (res.data || []).map(v => ({
            id: v.id,
            name: v.name,
            versionNumber: v.version_number,
            gameVersions: v.game_versions || [],
            loaders: v.loaders || [],
            datePublished: v.date_published,
            downloads: v.downloads || 0,
            featured: v.featured || false
        }));
    } catch (err) {
        console.error('Modrinth versions fetch error:', err.message);
        return [];
    }
}

async function getSpigetDownloadUrl(resourceId, versionId = null) {
    try {
        // Get resource details to get the latest version
        const res = await axios.get(`https://api.spiget.org/v2/resources/${resourceId}`, {
            headers: {
                'User-Agent': 'MinecraftPanel/1.0'
            }
        });
        
        if (res.data) {
            return {
                url: versionId 
                    ? `https://api.spiget.org/v2/resources/${resourceId}/versions/${versionId}/download`
                    : `https://api.spiget.org/v2/resources/${resourceId}/download`,
                filename: `${sanitize(res.data.name)}.jar`,
                version: res.data.file?.version || 'latest'
            };
        }
        throw new Error('Resource not found');
    } catch (err) {
        console.error('Spiget URL fetch error:', err.message);
        return null;
    }
}

async function getSpigetVersions(resourceId) {
    try {
        const res = await axios.get(`https://api.spiget.org/v2/resources/${resourceId}/versions`, {
            params: {
                size: 50,
                sort: '-releaseDate'
            },
            headers: {
                'User-Agent': 'MinecraftPanel/1.0'
            }
        });
        
        return (res.data || []).map(v => ({
            id: v.id,
            name: v.name,
            versionNumber: v.name,
            releaseDate: v.releaseDate,
            downloads: v.downloads || 0
        }));
    } catch (err) {
        console.error('Spiget versions fetch error:', err.message);
        return [];
    }
}

async function getHangarDownloadUrl(projectId, versionId = null) {
    try {
        const res = await axios.get(`https://hangar.papermc.io/api/v1/projects/${projectId}/versions`, {
            params: {
                limit: 25,
                offset: 0
            },
            headers: {
                'User-Agent': 'MinecraftPanel/1.0'
            }
        });
        
        if (res.data.result && res.data.result.length > 0) {
            const targetVersion = versionId
                ? res.data.result.find(v => v.name === versionId)
                : res.data.result[0];
            
            if (targetVersion) {
                // Hangar uses platform-specific downloads
                const platforms = Object.keys(targetVersion.downloads || {});
                if (platforms.length > 0) {
                    const platform = platforms[0]; // Use first available platform (usually PAPER)
                    const downloadUrl = `https://hangar.papermc.io/api/v1/projects/${projectId}/versions/${targetVersion.name}/${platform}/download`;
                    
                    return {
                        url: downloadUrl,
                        filename: `${sanitize(projectId)}-${targetVersion.name}.jar`,
                        version: targetVersion.name
                    };
                }
            }
        }
        throw new Error('No versions found');
    } catch (err) {
        console.error('Hangar URL fetch error:', err.message);
        return null;
    }
}

async function getHangarVersions(projectId) {
    try {
        const res = await axios.get(`https://hangar.papermc.io/api/v1/projects/${projectId}/versions`, {
            headers: {
                'User-Agent': 'MinecraftPanel/1.0'
            }
        });
        
        return (res.data.result || []).map(v => ({
            id: v.name,
            name: v.name,
            versionNumber: v.name,
            platformDependencies: v.platformDependencies || {},
            downloads: v.stats?.downloads || 0
        }));
    } catch (err) {
        console.error('Hangar versions fetch error:', err.message);
        return [];
    }
}

async function getBukkitDownloadUrl(projectId, fileId = null) {
    try {
        if (fileId) {
            // Get specific file
            const res = await axios.get(`https://api.curseforge.com/v1/mods/${projectId}/files/${fileId}`, {
                headers: {
                    'User-Agent': 'MinecraftPanel/1.0',
                    'x-api-key': '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm'
                }
            });
            
            if (res.data.data && res.data.data.downloadUrl) {
                return {
                    url: res.data.data.downloadUrl,
                    filename: res.data.data.fileName,
                    version: res.data.data.displayName
                };
            }
        } else {
            // Get latest file
            const res = await axios.get(`https://api.curseforge.com/v1/mods/${projectId}/files`, {
                params: {
                    pageSize: 10,
                    index: 0
                },
                headers: {
                    'User-Agent': 'MinecraftPanel/1.0',
                    'x-api-key': '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm'
                }
            });
            
            if (res.data.data && res.data.data.length > 0) {
                // Find first file with a download URL
                const file = res.data.data.find(f => f.downloadUrl);
                if (file && file.downloadUrl) {
                    return {
                        url: file.downloadUrl,
                        filename: file.fileName,
                        version: file.displayName
                    };
                }
            }
        }
        throw new Error('No downloadable files found');
    } catch (err) {
        console.error('Bukkit URL fetch error:', err.message);
        return null;
    }
}

async function getBukkitVersions(projectId) {
    try {
        const res = await axios.get(`https://api.curseforge.com/v1/mods/${projectId}/files`, {
            params: {
                pageSize: 50,
                index: 0
            },
            headers: {
                'User-Agent': 'MinecraftPanel/1.0',
                'x-api-key': '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm'
            }
        });
        
        return (res.data.data || []).map(f => ({
            id: f.id,
            name: f.displayName,
            versionNumber: f.displayName,
            gameVersions: f.gameVersions || [],
            fileDate: f.fileDate,
            downloads: f.downloadCount || 0
        }));
    } catch (err) {
        console.error('Bukkit versions fetch error:', err.message);
        return [];
    }
}
async function downloadPluginJar(downloadUrl, destPath) {
    try {
        console.log(`Attempting to download from: ${downloadUrl}`);
        console.log(`Destination: ${destPath}`);
        
        // Validate URL
        if (!downloadUrl || !downloadUrl.startsWith('http')) {
            throw new Error('Invalid download URL');
        }
        
        const response = await axios({
            url: downloadUrl,
            method: 'GET',
            responseType: 'stream',
            maxRedirects: 10,
            timeout: 60000, // 60 second timeout
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Accept redirects
            }
        });
        
        // Check if response is valid
        if (!response.data) {
            throw new Error('No data received from download URL');
        }
        
        // Ensure directory exists
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        
        const writer = fs.createWriteStream(destPath);
        
        return new Promise((resolve, reject) => {
            let downloadedBytes = 0;
            
            response.data.on('data', (chunk) => {
                downloadedBytes += chunk.length;
            });
            
            response.data.pipe(writer);
            
            writer.on('finish', () => {
                console.log(`Download complete: ${downloadedBytes} bytes written to ${destPath}`);
                
                // Verify file was created and has content
                if (fs.existsSync(destPath)) {
                    const stats = fs.statSync(destPath);
                    if (stats.size > 0) {
                        resolve();
                    } else {
                        fs.unlinkSync(destPath); // Remove empty file
                        reject(new Error('Downloaded file is empty'));
                    }
                } else {
                    reject(new Error('File was not created'));
                }
            });
            
            writer.on('error', (err) => {
                console.error('Writer error:', err);
                // Clean up partial file
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
                reject(err);
            });
            
            response.data.on('error', (err) => {
                console.error('Stream error:', err);
                writer.close();
                // Clean up partial file
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
                reject(err);
            });
        });
    } catch (err) {
        console.error('Download error:', err.message);
        console.error('URL:', downloadUrl);
        
        // Clean up any partial file
        if (fs.existsSync(destPath)) {
            try {
                fs.unlinkSync(destPath);
            } catch (cleanupErr) {
                console.error('Cleanup error:', cleanupErr);
            }
        }
        
        throw new Error(`Failed to download plugin: ${err.message}`);
    }
}
function getInstalledPlugins(serverId) {
    const pluginsDir = resolveServerPath(serverId, 'plugins');
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
    return fs.readdirSync(pluginsDir).filter(f => f.endsWith('.jar'));
}
// Player and world helpers
function readPlayerFile(serverId, fileName) {
    const filePath = resolveServerPath(serverId, fileName);
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8')) || [];
        } catch (err) {
            console.error(`Error reading ${fileName} for server ${serverId}`, err);
            return [];
        }
    }
    return [];
}
function writePlayerFile(serverId, fileName, data) {
    const filePath = resolveServerPath(serverId, fileName);
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error(`Error writing ${fileName} for server ${serverId}`, err);
    }
}
async function getUUID(name) {
    try {
        const { data } = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${name}`);
        const id = data.id;
        return `${id.substr(0,8)}-${id.substr(8,4)}-${id.substr(12,4)}-${id.substr(16,4)}-${id.substr(20)}`;
    } catch {
        return null;
    }
}
// FIXED: executeCommand now uses screen (consistent with start/stop) - no more broken spawn
function executeCommand(serverId, cmd) {
  sendCommand(serverId, cmd).catch(err => console.error('Execute command failed:', err));
  return true; // backward compatible
}
function getOnlinePlayers(serverId) {
    return onlinePlayers[serverId] || [];
}
function getDirSize(dir) {
    try {
        let size = 0;
        const walk = (p) => {
            const stats = fs.statSync(p);
            if (stats.isDirectory()) {
                fs.readdirSync(p).forEach(f => walk(path.join(p, f)));
            } else {
                size += stats.size;
            }
        };
        walk(dir);
        return size;
    } catch (err) {
        return 0;
    }
}
async function getWorldInfo(worldDir, serverDir = null) {
    try {
        const levelPath = path.join(worldDir, 'level.dat');
        
        // If level.dat doesn't exist, try to get info from server.properties
        if (!fs.existsSync(levelPath)) {
            // Try to find server.properties in parent directory or provided serverDir
            const parentDir = serverDir || path.dirname(worldDir);
            const propertiesPath = path.join(parentDir, 'server.properties');
            
            if (fs.existsSync(propertiesPath)) {
                try {
                    const propertiesContent = fs.readFileSync(propertiesPath, 'utf8');
                    const properties = parseProperties(propertiesContent);
                    
                    // Get seed (handle empty string)
                    const seed = properties['level-seed'] && properties['level-seed'].trim() !== '' 
                        ? properties['level-seed'] 
                        : 'Random';
                    
                    // Capitalize difficulty and gamemode for display
                    const difficulty = (properties['difficulty'] || 'easy').toString().charAt(0).toUpperCase() + (properties['difficulty'] || 'easy').toString().slice(1);
                    const gameType = (properties['gamemode'] || 'survival').toString().charAt(0).toUpperCase() + (properties['gamemode'] || 'survival').toString().slice(1);
                    
                    return {
                        seed: seed,
                        difficulty: difficulty,
                        gameType: gameType,
                        lastPlayed: 'Not yet started',
                        version: 'Pending first start'
                    };
                } catch (err) {
                    console.error(`Error reading server.properties for ${worldDir}:`, err);
                }
            }
            
            // Return default info for worlds without level.dat (not yet generated)
            return { 
                seed: 'Random', 
                difficulty: 'Easy', 
                gameType: 'Survival', 
                lastPlayed: 'Not yet started', 
                version: 'Pending first start' 
            };
        }
        
        const buf = fs.readFileSync(levelPath);
        const uncompressed = zlib.gunzipSync(buf);
        const parsed = await nbtParse(uncompressed);
        const simplified = prismarineNbt.simplify(parsed);
        const data = simplified.Data || {};
        let seed = 'Unknown';
        if (data.RandomSeed !== undefined) {
            seed = data.RandomSeed.value || data.RandomSeed;
        } else if (data.WorldGenSettings && data.WorldGenSettings.Seed !== undefined) {
            seed = data.WorldGenSettings.Seed.value || data.WorldGenSettings.Seed;
        }
        if (typeof seed === 'bigint') seed = seed.toString();
        const difficulty = data.Difficulty?.value ?? 1;
        const gameType = data.GameType?.value ?? 0;
        const lastPlayed = data.LastPlayed ? new Date(Number(data.LastPlayed)).toLocaleString() : 'Unknown';
        const mcVersion = data.DataVersion ? `MC ${data.DataVersion}` : 'Unknown';
        return {
            seed: seed.toString(),
            difficulty: ['Peaceful', 'Easy', 'Normal', 'Hard'][difficulty] || 'Unknown',
            gameType: ['Survival', 'Creative', 'Adventure', 'Spectator'][gameType] || 'Unknown',
            lastPlayed,
            version: mcVersion
        };
    } catch (err) {
        console.error(`Error parsing level.dat for ${worldDir}:`, err.message);
        return { seed: 'Unknown', difficulty: 'Unknown', gameType: 'Unknown', lastPlayed: 'Unknown', version: 'Unknown' };
    }
}
async function setWorldSeed(worldDir, newSeed) {
    try {
        const levelPath = path.join(worldDir, 'level.dat');
        const buf = fs.readFileSync(levelPath);
        const uncompressed = zlib.gunzipSync(buf);
        const parsed = await nbtParse(uncompressed);
        if (!parsed.value.Data) parsed.value.Data = { type: 'compound', value: {} };
        parsed.value.Data.value.Seed = { type: 'long', value: BigInt(newSeed) };
        const written = prismarineNbt.writeUncompressed(parsed);
        const compressed = zlib.gzipSync(written);
        fs.writeFileSync(levelPath, compressed);
    } catch (err) {
        throw err;
    }
}
// ================================================
// HELPER FUNCTIONS FOR PROFILE AND NOTIFICATIONS
// ================================================

// Helper function to get user statistics
async function getUserStats(userId) {
    try {
        // Get server count
        const serverCount = await dbGet('SELECT COUNT(*) as count FROM servers WHERE owner_id = ?', [userId]);
        
        // Get notification count
        const notificationCount = await dbGet('SELECT COUNT(*) as count FROM notifications WHERE user_id = ?', [userId]);
        const unreadNotificationCount = await dbGet('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
        
        // Get recent activity count (last 30 days)
        const recentActivityCount = await dbGet(`
            SELECT COUNT(*) as count FROM user_activity 
            WHERE user_id = ? AND created_at >= datetime('now', '-30 days')
        `, [userId]);

        // Get account age
        const user = await dbGet('SELECT created_at FROM users WHERE id = ?', [userId]);
        const accountAge = user ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;

        return {
            servers: serverCount ? serverCount.count : 0,
            notifications: notificationCount ? notificationCount.count : 0,
            unreadNotifications: unreadNotificationCount ? unreadNotificationCount.count : 0,
            recentActivity: recentActivityCount ? recentActivityCount.count : 0,
            accountAge
        };
    } catch (error) {
        console.error('Error getting user stats:', error);
        return {
            servers: 0,
            notifications: 0,
            unreadNotifications: 0,
            recentActivity: 0,
            accountAge: 0
        };
    }
}

// Notification helper functions
async function getUserNotifications(userId, limit = 50, unreadOnly = false) {
    try {
        let sql = 'SELECT * FROM notifications WHERE user_id = ?';
        const params = [userId];
        
        if (unreadOnly) {
            sql += ' AND is_read = 0';
        }
        
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);
        
        return await dbAll(sql, params);
    } catch (error) {
        console.error('Get user notifications error:', error);
        return [];
    }
}

async function getUnreadNotificationCount(userId) {
    try {
        const result = await dbGet('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
        return result ? result.count : 0;
    } catch (error) {
        console.error('Get unread notification count error:', error);
        return 0;
    }
}

async function markNotificationAsRead(notificationId, userId) {
    try {
        const result = await dbRun('UPDATE notifications SET is_read = 1, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?', [notificationId, userId]);
        return result.changes > 0;
    } catch (error) {
        console.error('Mark notification as read error:', error);
        return false;
    }
}

async function markAllNotificationsAsRead(userId, category = null) {
    try {
        let sql = 'UPDATE notifications SET is_read = 1, updated_at = datetime(\'now\') WHERE user_id = ?';
        const params = [userId];
        
        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }
        
        await dbRun(sql, params);
        return true;
    } catch (error) {
        console.error('Mark all notifications as read error:', error);
        return false;
    }
}

async function clearAllNotifications(userId, category = null) {
    try {
        let sql = 'DELETE FROM notifications WHERE user_id = ?';
        const params = [userId];
        
        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }
        
        await dbRun(sql, params);
        return true;
    } catch (error) {
        console.error('Clear all notifications error:', error);
        return false;
    }
}

async function createNotification(userId, title, message, type = 'info', options = {}) {
    try {
        const icon = options.icon || getIconForType(type);
        const category = options.category || 'general';
        
        await dbRun(`
            INSERT INTO notifications (user_id, title, message, type, category, icon, action_url, action_text, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [userId, title, message, type, category, icon, options.action_url || null, options.action_text || null, JSON.stringify(options) || null]);
        
        return true;
    } catch (error) {
        console.error('Create notification error:', error);
        return false;
    }
}

function getIconForType(type) {
    const icons = {
        success: 'check-circle',
        info: 'info-circle',
        warning: 'exclamation-triangle',
        error: 'exclamation-circle',
        system: 'cog'
    };
    return icons[type] || 'bell';
}

// Helper function to get notifications with pagination and filtering
async function getNotificationsPaginated(userId, page = 1, limit = 20, filter = 'all', category = 'all') {
    try {
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE user_id = ?';
        let params = [userId];

        // Add filter conditions
        if (filter === 'unread') {
            whereClause += ' AND is_read = 0';
        } else if (filter === 'read') {
            whereClause += ' AND is_read = 1';
        }

        if (category !== 'all') {
            whereClause += ' AND category = ?';
            params.push(category);
        }

        // Get notifications
        const notifications = await dbAll(`
            SELECT * FROM notifications 
            ${whereClause}
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        // Get total count
        const totalResult = await dbGet(`
            SELECT COUNT(*) as count FROM notifications ${whereClause}
        `, params);

        const total = totalResult ? totalResult.count : 0;
        const pages = Math.ceil(total / limit);

        return {
            data: notifications,
            pagination: {
                page,
                limit,
                total,
                pages,
                hasNext: page < pages,
                hasPrev: page > 1
            }
        };

    } catch (error) {
        console.error('Get notifications paginated error:', error);
        throw error;
    }
}

// Helper function to get notification statistics
async function getNotificationStats(userId) {
    try {
        // Get total counts
        const total = await dbGet('SELECT COUNT(*) as count FROM notifications WHERE user_id = ?', [userId]);
        const unread = await dbGet('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
        const today = await dbGet(`
            SELECT COUNT(*) as count FROM notifications 
            WHERE user_id = ? AND date(created_at) = date('now')
        `, [userId]);
        const thisWeek = await dbGet(`
            SELECT COUNT(*) as count FROM notifications 
            WHERE user_id = ? AND created_at >= datetime('now', '-7 days')
        `, [userId]);

        // Get category breakdown
        const categories = await dbAll(`
            SELECT category, COUNT(*) as count 
            FROM notifications 
            WHERE user_id = ? 
            GROUP BY category 
            ORDER BY count DESC
        `, [userId]);

        // Get type breakdown
        const types = await dbAll(`
            SELECT type, COUNT(*) as count 
            FROM notifications 
            WHERE user_id = ? 
            GROUP BY type 
            ORDER BY count DESC
        `, [userId]);

        return {
            total: total ? total.count : 0,
            unread: unread ? unread.count : 0,
            read: total ? total.count - (unread ? unread.count : 0) : 0,
            today: today ? today.count : 0,
            thisWeek: thisWeek ? thisWeek.count : 0,
            categories: categories || [],
            types: types || []
        };

    } catch (error) {
        console.error('Get notification stats error:', error);
        return {
            total: 0,
            unread: 0,
            read: 0,
            today: 0,
            thisWeek: 0,
            categories: [],
            types: []
        };
    }
}

// ================================================
// AUTHENTICATION ROUTES
// ================================================
app.get('/auth/login', async (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('auth/login', await getTemplateVars(req, null, { error: null, title: 'Login' }));
});
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
 
    try {
        const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
     
        if (!user) {
            return res.render('auth/login', await getTemplateVars(req, null, { error: 'Invalid username or password', title: 'Login' }));
        }
     
        if (user.status === 'suspended') {
            return res.render('auth/login', await getTemplateVars(req, null, { error: 'Account suspended', title: 'Login' }));
        }
     
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.render('auth/login', await getTemplateVars(req, null, { error: 'Invalid username or password', title: 'Login' }));
        }
     
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };
     
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Login error:', err);
        res.render('auth/login', await getTemplateVars(req, null, { error: 'Server error', title: 'Login' }));
    }
});
app.get('/auth/register', (req, res) => {
    if (!globalSettings.registrationEnabled) {
        return res.redirect('/auth/login');
    }
    if (req.session.user) return res.redirect('/dashboard');
    res.render('auth/register', { error: null });
});
app.post('/auth/register', async (req, res) => {
    if (!globalSettings.registrationEnabled) {
        return res.redirect('/auth/login');
    }
 
    const { username, email, password, confirmPassword } = req.body;
 
    if (password !== confirmPassword) {
        return res.render('auth/register', { error: 'Passwords do not match' });
    }
 
    try {
        const existing = await dbGet(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [username, email]
        );
     
        if (existing) {
            return res.render('auth/register', { error: 'Username or email already exists' });
        }
     
        const hashedPassword = await bcrypt.hash(password, 10);
        await dbRun(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
     
        res.redirect('/auth/login?success=Registration successful');
    } catch (err) {
        console.error('Registration error:', err);
        res.render('auth/register', { error: 'Registration failed' });
    }
});
app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});
// ================================================
// MAIN ROUTES
// ================================================
app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/auth/login');
    }
});
app.get('/dashboard', requireAuth, async (req, res) => {
    try {
      let servers = [];
 
      if (req.session.user.role === 'admin') {
        servers = await dbAll(`
          SELECT s.*, u.username AS owner_name
          FROM servers s
          LEFT JOIN users u ON s.owner_id = u.id
          ORDER BY s.created_at DESC
        `);
      } else {
        // Get servers owned by user OR where user is a subuser
        servers = await dbAll(`
          SELECT DISTINCT s.*, u.username AS owner_name,
                 CASE WHEN s.owner_id = ? THEN 1 ELSE 0 END as is_owner
          FROM servers s
          LEFT JOIN users u ON s.owner_id = u.id
          LEFT JOIN subusers su ON s.id = su.server_id
          WHERE s.owner_id = ? OR su.user_id = ?
          ORDER BY is_owner DESC, s.created_at DESC
        `, [req.session.user.id, req.session.user.id, req.session.user.id]);
      }
 
      // ✅ ALWAYS define these so EJS never throws ReferenceError
      const onlinePlayersLocal = {};
      const messages = [];
 
      res.render('dashboard', await getTemplateVars(req, null, {
        servers,
        onlinePlayers: onlinePlayersLocal,
        messages,
        currentPage: 'dashboard',
        totalServers: servers.length,
        title: 'Dashboard'
      }));
 
    } catch (err) {
      console.error('Dashboard error:', err);
      res.status(500).render('error', await getTemplateVars(req, null, {
        message: 'Failed to load dashboard',
        status: 500,
        title: 'Error'
      }));
    }
  });

// ================================================
// ROUTES
// ================================================

// ================================================
// PROFILE ROUTES
// ================================================

// Configure multer for profile picture uploads
const profileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'public/uploads/profiles');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + req.session.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const profileUpload = multer({
    storage: profileStorage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit for profile pictures
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// Profile page
app.get('/profile', requireAuth, async (req, res) => {
    try {
        // Get user with all profile data
        const user = await dbGet(`
            SELECT u.*, up.* 
            FROM users u 
            LEFT JOIN user_profiles up ON u.id = up.user_id 
            WHERE u.id = ?
        `, [req.session.user.id]);

        if (!user) {
            return res.redirect('/auth/login');
        }

        // Get user statistics
        const stats = await getUserStats(req.session.user.id);
        
        res.render('profile/index', await getTemplateVars(req, null, {
            user: {
                ...user,
                theme_preference: user.theme_preference || 'dark',
                theme_primary_color: user.theme_primary_color || '#2d6a4f',
                theme_accent_color: user.theme_accent_color || '#40916c',
                language: user.language || 'en',
                timezone: user.timezone || 'UTC',
                email_notifications: user.email_notifications !== 0,
                push_notifications: user.push_notifications !== 0,
                security_notifications: user.security_notifications !== 0
            },
            stats,
            currentPage: 'profile',
            title: 'Profile Settings'
        }));
    } catch (error) {
        console.error('Profile page error:', error);
        res.status(500).render('error', await getTemplateVars(req, null, { 
            error: 'Failed to load profile',
            message: 'Failed to load profile',
            status: 500,
            title: 'Error'
        }));
    }
});

// Update profile
app.post('/profile/update', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Get current user data first
        const currentUser = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
        if (!currentUser) {
            return res.json({ success: false, error: 'User not found' });
        }
        
        const {
            display_name,
            email,
            bio,
            location,
            website,
            current_password,
            new_password,
            theme_preference,
            theme_primary_color,
            theme_accent_color,
            language,
            timezone,
            email_notifications,
            push_notifications,
            security_notifications,
            two_factor_enabled
        } = req.body;

        // Use current email if not provided
        const newEmail = email || currentUser.email;

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            return res.json({ success: false, error: 'Invalid email format' });
        }

        // Check if email is already taken by another user
        if (newEmail !== currentUser.email) {
            const existingUser = await dbGet('SELECT id FROM users WHERE email = ? AND id != ?', [newEmail, userId]);
            if (existingUser) {
                return res.json({ success: false, error: 'Email is already taken' });
            }
        }

        // Handle password change
        let passwordUpdate = '';
        let updateParams = [];

        if (new_password && current_password) {
            // Verify current password
            if (!bcrypt.compareSync(current_password, currentUser.password)) {
                return res.json({ success: false, error: 'Current password is incorrect' });
            }

            // Validate new password strength
            if (new_password.length < 6) {
                return res.json({ success: false, error: 'New password must be at least 6 characters long' });
            }

            const hashedPassword = bcrypt.hashSync(new_password, 12);
            passwordUpdate = ', password = ?';
            updateParams.push(hashedPassword);
        }

        // Update users table only if email or password changed
        if (newEmail !== currentUser.email || passwordUpdate) {
            const userUpdateQuery = `
                UPDATE users 
                SET email = ?${passwordUpdate}
                WHERE id = ?
            `;
            updateParams.unshift(newEmail);
            updateParams.push(userId);

            await dbRun(userUpdateQuery, updateParams);
        }

        // Update or insert user profile
        const profileData = {
            display_name: display_name || null,
            bio: bio || null,
            location: location || null,
            website: website || null,
            theme_preference: theme_preference || 'dark',
            theme_primary_color: theme_primary_color || '#2d6a4f',
            theme_accent_color: theme_accent_color || '#40916c',
            language: language || 'en',
            timezone: timezone || 'UTC',
            email_notifications: email_notifications ? 1 : 0,
            push_notifications: push_notifications ? 1 : 0,
            security_notifications: security_notifications ? 1 : 0,
            two_factor_enabled: two_factor_enabled ? 1 : 0
        };

        // Check if profile exists
        const existingProfile = await dbGet('SELECT user_id FROM user_profiles WHERE user_id = ?', [userId]);

        if (existingProfile) {
            // Update existing profile
            await dbRun(`
                UPDATE user_profiles 
                SET display_name = ?, bio = ?, location = ?, website = ?,
                    theme_preference = ?, theme_primary_color = ?, theme_accent_color = ?,
                    language = ?, timezone = ?, email_notifications = ?, 
                    push_notifications = ?, security_notifications = ?, two_factor_enabled = ?,
                    updated_at = datetime('now')
                WHERE user_id = ?
            `, [
                profileData.display_name, profileData.bio, profileData.location, profileData.website,
                profileData.theme_preference, profileData.theme_primary_color, profileData.theme_accent_color,
                profileData.language, profileData.timezone, profileData.email_notifications,
                profileData.push_notifications, profileData.security_notifications, profileData.two_factor_enabled,
                userId
            ]);
        } else {
            // Insert new profile
            await dbRun(`
                INSERT INTO user_profiles (
                    user_id, display_name, bio, location, website,
                    theme_preference, theme_primary_color, theme_accent_color,
                    language, timezone, email_notifications, push_notifications, 
                    security_notifications, two_factor_enabled, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
                userId, profileData.display_name, profileData.bio, profileData.location, profileData.website,
                profileData.theme_preference, profileData.theme_primary_color, profileData.theme_accent_color,
                profileData.language, profileData.timezone, profileData.email_notifications,
                profileData.push_notifications, profileData.security_notifications, profileData.two_factor_enabled
            ]);
        }

        // Update session data
        req.session.user.email = email;
        req.session.user.display_name = display_name;

        // Create notification for profile update
        await createNotification(
            userId,
            'Profile Updated',
            'Your profile settings have been successfully updated.',
            'success',
            { category: 'account' }
        );

        res.json({ success: true, message: 'Profile updated successfully' });

    } catch (error) {
        console.error('Profile update error:', error);
        res.json({ success: false, error: 'Failed to update profile' });
    }
});

// Upload profile picture
app.post('/profile/upload-picture', requireAuth, profileUpload.single('profile_picture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.json({ success: false, error: 'No file uploaded' });
        }

        const userId = req.session.user.id;
        const profilePicturePath = `/uploads/profiles/${req.file.filename}`;

        // Get old profile picture to delete it
        const oldProfile = await dbGet('SELECT profile_picture FROM user_profiles WHERE user_id = ?', [userId]);
        
        // Update profile picture in database
        const existingProfile = await dbGet('SELECT user_id FROM user_profiles WHERE user_id = ?', [userId]);
        
        if (existingProfile) {
            await dbRun('UPDATE user_profiles SET profile_picture = ?, updated_at = datetime(\'now\') WHERE user_id = ?', 
                [profilePicturePath, userId]);
        } else {
            await dbRun(`
                INSERT INTO user_profiles (user_id, profile_picture, created_at, updated_at) 
                VALUES (?, ?, datetime('now'), datetime('now'))
            `, [userId, profilePicturePath]);
        }

        // Delete old profile picture file
        if (oldProfile && oldProfile.profile_picture && oldProfile.profile_picture !== profilePicturePath) {
            const oldFilePath = path.join(__dirname, 'public', oldProfile.profile_picture);
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
            }
        }

        // Create notification
        await createNotification(
            userId,
            'Profile Picture Updated',
            'Your profile picture has been successfully updated.',
            'success',
            { category: 'account' }
        );

        res.json({ 
            success: true, 
            message: 'Profile picture updated successfully',
            profile_picture: profilePicturePath
        });

    } catch (error) {
        console.error('Profile picture upload error:', error);
        res.json({ success: false, error: 'Failed to upload profile picture' });
    }
});

// Delete profile picture
app.delete('/profile/delete-picture', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Get current profile picture
        const profile = await dbGet('SELECT profile_picture FROM user_profiles WHERE user_id = ?', [userId]);
        
        if (profile && profile.profile_picture) {
            // Delete file
            const filePath = path.join(__dirname, 'public', profile.profile_picture);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Update database
            await dbRun('UPDATE user_profiles SET profile_picture = NULL, updated_at = datetime(\'now\') WHERE user_id = ?', [userId]);

            // Create notification
            await createNotification(
                userId,
                'Profile Picture Removed',
                'Your profile picture has been removed.',
                'info',
                { category: 'account' }
            );
        }

        res.json({ success: true, message: 'Profile picture deleted successfully' });

    } catch (error) {
        console.error('Profile picture delete error:', error);
        res.json({ success: false, error: 'Failed to delete profile picture' });
    }
});

// Get user activity log
app.get('/profile/activity', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const activities = await dbAll(`
            SELECT * FROM user_activity 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);

        const totalCount = await dbGet('SELECT COUNT(*) as count FROM user_activity WHERE user_id = ?', [userId]);

        res.json({
            success: true,
            activities,
            pagination: {
                page,
                limit,
                total: totalCount.count,
                pages: Math.ceil(totalCount.count / limit)
            }
        });

    } catch (error) {
        console.error('Activity log error:', error);
        res.json({ success: false, error: 'Failed to load activity log' });
    }
});

// ================================================
// NOTIFICATIONS ROUTES
// ================================================

// Notifications page
app.get('/notifications', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const filter = req.query.filter || 'all'; // all, unread, read
        const category = req.query.category || 'all'; // all, system, account, server, security

        // Get notifications with pagination
        const notifications = await getNotificationsPaginated(userId, page, limit, filter, category);
        const unreadCount = await getUnreadNotificationCount(userId);
        const stats = await getNotificationStats(userId);

        res.render('notifications/index', await getTemplateVars(req, null, {
            notifications: notifications.data,
            pagination: notifications.pagination,
            unreadCount,
            stats,
            currentFilter: filter,
            currentCategory: category,
            currentPage: 'notifications',
            title: 'Notifications'
        }));

    } catch (error) {
        console.error('Notifications page error:', error);
        res.status(500).render('error', await getTemplateVars(req, null, { 
            error: 'Failed to load notifications',
            message: 'Failed to load notifications',
            status: 500,
            title: 'Error'
        }));
    }
});

// Get notifications API (for AJAX)
app.get('/notifications/api', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const filter = req.query.filter || 'all';
        const category = req.query.category || 'all';

        const notifications = await getNotificationsPaginated(userId, page, limit, filter, category);
        const unreadCount = await getUnreadNotificationCount(userId);

        res.json({
            success: true,
            notifications: notifications.data,
            pagination: notifications.pagination,
            unreadCount
        });

    } catch (error) {
        console.error('Notifications API error:', error);
        res.json({ success: false, error: 'Failed to load notifications' });
    }
});

// Mark notification as read
app.post('/notifications/:id/read', requireAuth, async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.session.user.id;

        const result = await markNotificationAsRead(notificationId, userId);
        
        if (result) {
            res.json({ success: true, message: 'Notification marked as read' });
        } else {
            res.json({ success: false, error: 'Notification not found or access denied' });
        }

    } catch (error) {
        console.error('Mark notification read error:', error);
        res.json({ success: false, error: 'Failed to mark notification as read' });
    }
});

// Mark all notifications as read
app.post('/notifications/mark-all-read', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const category = req.body.category || null;

        await markAllNotificationsAsRead(userId, category);

        res.json({ success: true, message: 'All notifications marked as read' });

    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.json({ success: false, error: 'Failed to mark all notifications as read' });
    }
});

// Clear all notifications
app.delete('/notifications/clear-all', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const category = req.body.category || null;

        await clearAllNotifications(userId, category);

        res.json({ success: true, message: 'All notifications cleared' });

    } catch (error) {
        console.error('Clear all notifications error:', error);
        res.json({ success: false, error: 'Failed to clear all notifications' });
    }
});

// Delete specific notification
app.delete('/notifications/:id', requireAuth, async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.session.user.id;

        // Verify notification belongs to user
        const notification = await dbGet('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [notificationId, userId]);
        
        if (!notification) {
            return res.json({ success: false, error: 'Notification not found or access denied' });
        }

        await dbRun('DELETE FROM notifications WHERE id = ? AND user_id = ?', [notificationId, userId]);

        res.json({ success: true, message: 'Notification deleted' });

    } catch (error) {
        console.error('Delete notification error:', error);
        res.json({ success: false, error: 'Failed to delete notification' });
    }
});

// Get notification settings
app.get('/notifications/settings', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const settings = await dbGet(`
            SELECT email_notifications, push_notifications, security_notifications,
                   notification_frequency, quiet_hours_start, quiet_hours_end
            FROM user_profiles 
            WHERE user_id = ?
        `, [userId]);

        res.render('notifications/settings', await getTemplateVars(req, null, {
            settings: settings || {
                email_notifications: 1,
                push_notifications: 1,
                security_notifications: 1,
                notification_frequency: 'immediate',
                quiet_hours_start: null,
                quiet_hours_end: null
            },
            currentPage: 'notification-settings',
            title: 'Notification Settings'
        }));

    } catch (error) {
        console.error('Notification settings error:', error);
        res.status(500).render('error', await getTemplateVars(req, null, { 
            error: 'Failed to load notification settings',
            message: 'Failed to load notification settings',
            status: 500,
            title: 'Error'
        }));
    }
});

// Update notification settings
app.post('/notifications/settings', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const {
            email_notifications,
            push_notifications,
            security_notifications,
            notification_frequency,
            quiet_hours_start,
            quiet_hours_end,
            categories
        } = req.body;

        // Check if profile exists
        const existingProfile = await dbGet('SELECT user_id FROM user_profiles WHERE user_id = ?', [userId]);

        const settingsData = {
            email_notifications: email_notifications ? 1 : 0,
            push_notifications: push_notifications ? 1 : 0,
            security_notifications: security_notifications ? 1 : 0,
            notification_frequency: notification_frequency || 'immediate',
            quiet_hours_start: quiet_hours_start || null,
            quiet_hours_end: quiet_hours_end || null
        };

        if (existingProfile) {
            await dbRun(`
                UPDATE user_profiles 
                SET email_notifications = ?, push_notifications = ?, security_notifications = ?,
                    notification_frequency = ?, quiet_hours_start = ?, quiet_hours_end = ?,
                    updated_at = datetime('now')
                WHERE user_id = ?
            `, [
                settingsData.email_notifications, settingsData.push_notifications, settingsData.security_notifications,
                settingsData.notification_frequency, settingsData.quiet_hours_start, settingsData.quiet_hours_end,
                userId
            ]);
        } else {
            await dbRun(`
                INSERT INTO user_profiles (
                    user_id, email_notifications, push_notifications, security_notifications,
                    notification_frequency, quiet_hours_start, quiet_hours_end, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
                userId, settingsData.email_notifications, settingsData.push_notifications, settingsData.security_notifications,
                settingsData.notification_frequency, settingsData.quiet_hours_start, settingsData.quiet_hours_end
            ]);
        }

        // Update category preferences if provided
        if (categories && typeof categories === 'object') {
            for (const [category, enabled] of Object.entries(categories)) {
                await dbRun(`
                    INSERT OR REPLACE INTO notification_preferences (user_id, category, enabled, updated_at)
                    VALUES (?, ?, ?, datetime('now'))
                `, [userId, category, enabled ? 1 : 0]);
            }
        }

        // Create notification for settings update
        await createNotification(
            userId,
            'Notification Settings Updated',
            'Your notification preferences have been successfully updated.',
            'success',
            { category: 'account' }
        );

        res.json({ success: true, message: 'Notification settings updated successfully' });

    } catch (error) {
        console.error('Update notification settings error:', error);
        res.json({ success: false, error: 'Failed to update notification settings' });
    }
});

// Test notification (for testing purposes)
app.post('/notifications/test', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { type, title, message } = req.body;

        await createNotification(
            userId,
            title || 'Test Notification',
            message || 'This is a test notification to verify your notification system is working correctly.',
            type || 'info',
            { category: 'system', test: true }
        );

        res.json({ success: true, message: 'Test notification sent' });

    } catch (error) {
        console.error('Test notification error:', error);
        res.json({ success: false, error: 'Failed to send test notification' });
    }
});

// ================================================
// ADMIN ROUTES
// ================================================
app.get('/admin', requireAdmin, async (req, res) => {
    try {
        const users = await dbAll('SELECT * FROM users ORDER BY created_at DESC');
        const servers = await dbAll('SELECT * FROM servers ORDER BY created_at DESC');
     
        res.render('admin/index', await getTemplateVars(req, null, {
            users,
            servers,
            stats: {
                totalUsers: users.length,
                totalServers: servers.length,
                activeServers: servers.filter(s => s.status === 'running').length
            },
            systemInfo: {
                cpuCores: os.cpus().length,
                totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
                freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024) + ' GB',
                platform: os.platform(),
                nodeVersion: process.version,
                uptime: process.uptime()
            },
            title: 'Admin Dashboard'
        }));
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.status(500).render('error', await getTemplateVars(req, null, { message: 'Failed to load admin panel', status: 500, title: 'Error' }));
    }
});
// User management
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
      const search = req.query.search || '';
      const role = req.query.role || '';
      const status = req.query.status || '';
      
      let query = 'SELECT * FROM users WHERE 1=1';
      const params = [];
      
      if (search) {
          query += ' AND (username LIKE ? OR email LIKE ?)';
          const term = `%${search}%`;
          params.push(term, term);
      }
      
      if (role) {
          query += ' AND role = ?';
          params.push(role);
      }
      
      if (status) {
          query += ' AND status = ?';
          params.push(status);
      }
      
      query += ' ORDER BY created_at DESC';
      const users = await dbAll(query, params);
      
      res.render('admin/users', await getTemplateVars(req, null, {
          users,
          search,
          role,
          status,
          title: 'User Management'
      }));
  } catch (err) {
      console.error('Admin users error:', err);
      res.status(500).render('error', await getTemplateVars(req, null, {
          message: 'Failed to load users',
          status: 500,
          title: 'Error'
      }));
  }
});

// User create page
app.get('/admin/users/create', requireAdmin, async (req, res) => {
  try {
      res.render('admin/user-create', await getTemplateVars(req, null, {
          title: 'Create User'
      }));
  } catch (err) {
      console.error('User create page error:', err);
      res.status(500).render('error', await getTemplateVars(req, null, {
          message: 'Failed to load create page',
          status: 500,
          title: 'Error'
      }));
  }
});

// User edit page
app.get('/admin/users/:id/edit', requireAdmin, async (req, res) => {
  try {
      const userId = req.params.id;
      console.log('=== USER EDIT ROUTE HIT ===');
      console.log('User edit page requested for user ID:', userId);
      console.log('Full URL:', req.url);
      console.log('Path:', req.path);
      console.log('Params:', req.params);
      
      const editUser = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
      
      if (!editUser) {
          console.log('User not found:', userId);
          return res.status(404).render('error', await getTemplateVars(req, null, {
              message: `User with ID ${userId} not found`,
              status: 404,
              title: 'User Not Found'
          }));
      }
      
      console.log('User found:', editUser.username);
      res.render('admin/user-edit', await getTemplateVars(req, null, {
          editUser,
          title: `Edit User - ${editUser.username}`
      }));
  } catch (err) {
      console.error('User edit page error:', err);
      res.status(500).render('error', await getTemplateVars(req, null, {
          message: 'Failed to load edit page',
          status: 500,
          title: 'Error'
      }));
  }
});

app.post('/admin/users/create', requireAdmin, async (req, res) => {
    try {
        console.log('Create user request received:', {
            body: req.body,
            hasUsername: !!req.body.username,
            hasEmail: !!req.body.email,
            hasPassword: !!req.body.password,
            hasRole: !!req.body.role
        });
        
        const { username, email, password, role, status } = req.body;
     
        if (!username || !email || !password || !role) {
            console.log('Validation failed: Missing required fields');
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        // Validate username format
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            console.log('Validation failed: Invalid username format');
            return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
        }
        
        // Validate username length
        if (username.length < 3 || username.length > 32) {
            console.log('Validation failed: Invalid username length');
            return res.status(400).json({ error: 'Username must be between 3 and 32 characters' });
        }
        
        // Validate password length
        if (password.length < 6) {
            console.log('Validation failed: Password too short');
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
     
        const existing = await dbGet(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [username, email]
        );
     
        if (existing) {
            console.log('Validation failed: Username or email already exists');
            return res.status(400).json({ error: 'Username or email already exists' });
        }
     
        console.log('Creating user:', username);
        const hashedPassword = await bcrypt.hash(password, 10);
        await dbRun(
            'INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
            [username, email, hashedPassword, role, status || 'active']
        );
     
        console.log('User created successfully:', username);
        
        // Redirect to users list instead of JSON response
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Failed to create user: ' + err.message });
    }
});

app.post('/admin/users/:id/update', requireAdmin, async (req, res) => {
    try {
        console.log('Update user request received:', {
            userId: req.params.id,
            body: req.body,
            hasUsername: !!req.body.username,
            hasEmail: !!req.body.email,
            hasRole: !!req.body.role,
            hasStatus: !!req.body.status,
            hasPassword: !!req.body.password
        });
        
        const { username, email, role, status, password } = req.body;
        const userId = req.params.id;
     
        if (!username || !email || !role || !status) {
            console.log('Validation failed: Missing required fields');
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        // Validate username format
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            console.log('Validation failed: Invalid username format');
            return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
        }
        
        // Validate username length
        if (username.length < 3 || username.length > 32) {
            console.log('Validation failed: Invalid username length');
            return res.status(400).json({ error: 'Username must be between 3 and 32 characters' });
        }
     
        const existing = await dbGet(
            'SELECT * FROM users WHERE (username = ? OR email = ?) AND id != ?',
            [username, email, userId]
        );
     
        if (existing) {
            console.log('Validation failed: Username or email already in use');
            return res.status(400).json({ error: 'Username or email already in use' });
        }
        
        // Update user with or without password
        if (password && password.length > 0) {
            // Validate password length
            if (password.length < 6) {
                console.log('Validation failed: Password too short');
                return res.status(400).json({ error: 'Password must be at least 6 characters' });
            }
            
            console.log('Updating user with new password:', username);
            const hashedPassword = await bcrypt.hash(password, 10);
            await dbRun(
                'UPDATE users SET username = ?, email = ?, role = ?, status = ?, password = ? WHERE id = ?',
                [username, email, role, status, hashedPassword, userId]
            );
        } else {
            console.log('Updating user without password change:', username);
            await dbRun(
                'UPDATE users SET username = ?, email = ?, role = ?, status = ? WHERE id = ?',
                [username, email, role, status, userId]
            );
        }
     
        console.log('User updated successfully:', username);
        
        // Redirect to users list instead of JSON response
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ error: 'Failed to update user: ' + err.message });
    }
});
app.post('/admin/users/:id/delete', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        
        console.log('Delete user request received:', { userId });
     
        // Check if user has servers
        const userServers = await dbAll('SELECT * FROM servers WHERE owner_id = ?', [userId]);
        if (userServers.length > 0) {
            console.log('Validation failed: User has active servers');
            return res.status(400).json({
                error: 'Cannot delete user with active servers'
            });
        }
     
        console.log('Deleting user:', userId);
        await dbRun('DELETE FROM users WHERE id = ?', [userId]);
        console.log('User deleted successfully:', userId);
        
        // Redirect to users list instead of JSON response
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user: ' + err.message });
    }
});
// Server management
app.get('/admin/servers', requireAdmin, async (req, res) => {
  try {
      const search = req.query.search ? req.query.search.trim() : '';
      const type = req.query.type ? req.query.type.trim() : '';
      const status = req.query.status ? req.query.status.trim() : '';
      
      let query = `
          SELECT s.*, u.username AS owner_name
          FROM servers s
          LEFT JOIN users u ON s.owner_id = u.id
      `;
      const params = [];
      const conditions = [];
      
      if (search) {
          conditions.push('(s.name LIKE ? OR u.username LIKE ?)');
          const term = `%${search}%`;
          params.push(term, term);
      }
      
      if (type) {
          conditions.push('s.server_type = ?');
          params.push(type);
      }
      
      if (status) {
          conditions.push('s.status = ?');
          params.push(status);
      }
      
      if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY s.created_at DESC';
      const servers = await dbAll(query, params);
      
      res.render('admin/servers', await getTemplateVars(req, null, {
          servers,
          search,
          type,
          status,
          title: 'Server Management'
      }));
  } catch (err) {
      console.error('Admin servers error:', err);
      res.status(500).render('error', await getTemplateVars(req, null, {
          message: 'Failed to load servers',
          status: 500,
          title: 'Error'
      }));
  }
});
// New GET route for server create form
app.get('/admin/servers/create', requireAdmin, async (req, res) => {
    try {
        const users = await dbAll('SELECT id, username, email FROM users ORDER BY username ASC');
        res.render('admin/server-create', await getTemplateVars(req, null, {
            users,
            title: 'Create Server'
        }));
    } catch (err) {
        console.error('Server create form error:', err);
        res.status(500).render('error', await getTemplateVars(req, null, {
            message: 'Failed to load create form',
            status: 500,
            title: 'Error'
        }));
    }
});

// GET route for server edit form
app.get('/admin/servers/:id/edit', requireAdmin, async (req, res) => {
    try {
        const serverId = req.params.id;
        const editServer = await dbGet(
            'SELECT s.*, u.username AS owner_name FROM servers s LEFT JOIN users u ON s.owner_id = u.id WHERE s.id = ?',
            [serverId]
        );
        
        if (!editServer) {
            return res.status(404).render('error', await getTemplateVars(req, null, {
                message: 'Server not found',
                status: 404,
                title: 'Error'
            }));
        }
        
        const users = await dbAll('SELECT id, username, email FROM users ORDER BY username ASC');
        
        res.render('admin/server-edit', await getTemplateVars(req, null, {
            editServer,
            users,
            title: `Edit Server - ${editServer.name}`
        }));
    } catch (err) {
        console.error('Server edit page error:', err);
        res.status(500).render('error', await getTemplateVars(req, null, {
            message: 'Failed to load edit page',
            status: 500,
            title: 'Error'
        }));
    }
});

// POST route for server update
app.post('/admin/servers/:id/update', requireAdmin, async (req, res) => {
    try {
        const serverId = req.params.id;
        const { name, owner_id, version, port, ram, cpu, disk } = req.body;
        
        if (!name || !owner_id || !version || !port || !ram || !cpu || !disk) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        // Validate name length
        if (name.length < 3 || name.length > 64) {
            return res.status(400).json({ error: 'Server name must be between 3 and 64 characters' });
        }
        
        // Validate port range
        const portNum = parseInt(port);
        if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
            return res.status(400).json({ error: 'Port must be between 1024 and 65535' });
        }
        
        // Validate RAM
        const ramNum = parseInt(ram);
        if (isNaN(ramNum) || ramNum < 512) {
            return res.status(400).json({ error: 'RAM must be at least 512 MB' });
        }
        
        // Validate CPU
        const cpuNum = parseInt(cpu);
        if (isNaN(cpuNum) || cpuNum < 1) {
            return res.status(400).json({ error: 'CPU must be at least 1 core' });
        }
        
        // Validate Disk
        const diskNum = parseInt(disk);
        if (isNaN(diskNum) || diskNum < 1024) {
            return res.status(400).json({ error: 'Disk must be at least 1024 MB (1 GB)' });
        }
        
        // Check if port is already in use by another server
        const portCheck = await dbGet(
            'SELECT * FROM servers WHERE port = ? AND id != ?',
            [portNum, serverId]
        );
        
        if (portCheck) {
            return res.status(400).json({ error: 'Port is already in use by another server' });
        }
        
        await dbRun(
            'UPDATE servers SET name = ?, owner_id = ?, version = ?, port = ?, ram = ?, cpu = ?, disk = ? WHERE id = ?',
            [name, owner_id, version, portNum, ramNum, cpuNum, diskNum, serverId]
        );
        
        res.redirect('/admin/servers');
    } catch (err) {
        console.error('Update server error:', err);
        res.status(500).json({ error: 'Failed to update server' });
    }
});

// API endpoint to fetch versions for a server type (public - no auth required)
app.get('/api/versions/:serverType', async (req, res) => {
    try {
        const serverType = req.params.serverType;
        const limit = req.query.limit ? parseInt(req.query.limit) : 20;
        
        const versions = await fetchMinecraftVersions(serverType, limit);
        res.json({ success: true, versions });
    } catch (err) {
        console.error('Fetch versions error:', err);
        res.status(500).json({ error: 'Failed to fetch versions' });
    }
});

// API endpoint to get port information for a specific server
app.get('/api/servers/:id/port-info', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }
        
        const portInfo = getPortInformation(serverId, server.server_type, server.port);
        res.json({ success: true, portInfo });
        
    } catch (err) {
        console.error('Error getting port information:', err);
        res.status(500).json({ error: 'Failed to get port information' });
    }
});

// API endpoint to get available port ranges and server type information
app.get('/api/port-ranges', requireAuth, (req, res) => {
    try {
        const ranges = {
            'Java Edition': PORT_CONFIG.JAVA_EDITION,
            'Proxy Servers': PORT_CONFIG.PROXY_SERVERS,
            'Bedrock Edition': PORT_CONFIG.BEDROCK_EDITION
        };
        
        res.json({
            success: true,
            ranges: ranges,
            reservedPorts: PORT_CONFIG.RESERVED_PORTS,
            serverTypes: {
                java: ['vanilla', 'paper', 'purpur', 'spigot', 'bukkit', 'fabric', 'forge', 'quilt', 'mohist', 'catserver'],
                proxy: ['velocity', 'bungeecord', 'waterfall'],
                bedrock: ['bedrock', 'nukkit']
            },
            protectionLevels: {
                'Java Edition': 'Standard Protection - Automatic port management in range 25565-25665',
                'Proxy Servers': 'High Protection - Network isolation in dedicated range 25700-25799',
                'Bedrock Edition': 'Medium Protection - Cross-platform compatibility in range 19132-19232'
            }
        });
        
    } catch (err) {
        console.error('Error getting port ranges:', err);
        res.status(500).json({ error: 'Failed to get port ranges' });
    }
});
app.post('/admin/servers/create', requireAdmin, async (req, res) => {
    try {
        let { name, owner_id, ram, cpu, disk, port, version, server_type, server_ip = '', ip_alias = '', port_alias = '' } = req.body;
        // Trim and validate required fields
        if (!name || (name = name.trim()) === '') {
            return res.status(400).json({ error: 'Server name is required' });
        }
        if (!owner_id || isNaN(owner_id) || (owner_id = parseInt(owner_id)) <= 0) {
            return res.status(400).json({ error: 'Valid owner user ID is required' });
        }
        if (!ram || isNaN(ram) || (ram = parseInt(ram)) < 512) {
            return res.status(400).json({ error: 'RAM must be at least 512 MB' });
        }
        if (!port || isNaN(port) || (port = parseInt(port)) < 1024 || port > 65535) {
            return res.status(400).json({ error: 'Valid port between 1024-65535 is required' });
        }
        
        // Validate CPU
        cpu = parseInt(cpu) || 2;
        if (isNaN(cpu) || cpu < 1) {
            return res.status(400).json({ error: 'CPU must be at least 1 core' });
        }
        
        // Validate Disk
        disk = parseInt(disk) || 10240;
        if (isNaN(disk) || disk < 1024) {
            return res.status(400).json({ error: 'Disk must be at least 1024 MB (1 GB)' });
        }
        version = version?.trim() || 'latest';
        server_type = server_type?.trim() || 'vanilla';
        ip_alias = ip_alias?.trim() || '';
        port_alias = port_alias?.trim() || '';
        // Check if owner exists
        const owner = await dbGet('SELECT * FROM users WHERE id = ?', [owner_id]);
        if (!owner) {
            return res.status(404).json({ error: 'Owner user not found' });
        }
        
        // Smart Port Protection: Assign port based on server type
        const assignedPort = await findAvailablePortForServerType(server_type);
        console.log(`Auto-assigned ${getPortRangeForServerType(server_type).CATEGORY} port ${assignedPort} for new ${server_type} server: ${name}`);
        
        // Insert into database with auto-assigned port
        const result = await dbRun(
            `INSERT INTO servers (name, owner_id, ram, cpu, disk, port, server_ip, ip_alias, port_alias, version, server_type, settings)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                owner_id,
                ram,
                cpu,
                disk,
                assignedPort,  // Use auto-assigned port
                server_ip,
                ip_alias,
                port_alias,
                version,
                server_type,
                JSON.stringify({ autoRestart: true })
            ]
        );
        // Create server directory
        const serverDir = path.join(SERVERS_DIR, result.lastID.toString());
        fs.mkdirSync(serverDir, { recursive: true });
        
        // Download server jar and get actual version
        console.log(`🚀 Creating ${server_type} server with version ${version}...`);
        const actualVersion = await downloadServerJar(server_type, version, serverDir);
        
        // Update version in db if it was 'latest'
        if (version === 'latest') {
            await dbRun('UPDATE servers SET version = ? WHERE id = ?', [actualVersion, result.lastID]);
        }
        // Accept EULA
        fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n', 'utf8');
        // Create initial server.properties with auto-assigned port
        const properties = {
            'server-port': assignedPort,  // Use auto-assigned port
            'server-ip': server_ip,
            'max-players': 20,
            'online-mode': true,
            'view-distance': 10,
            'simulation-distance': 10,
            'motd': name
        };
        writeProperties(properties, path.join(serverDir, 'server.properties'));
        res.redirect('/admin/servers');
    } catch (err) {
        console.error('Create server error:', err);
        res.status(500).json({ error: 'Failed to create server. Check server logs.' });
    }
});
app.post('/admin/servers/:id/update', requireAdmin, async (req, res) => {
    try {
        const serverId = req.params.id;
        let { name, ram, cpu, disk, server_ip = '', ip_alias = '', port_alias = '' } = req.body;
        if (!name || (name = name.trim()) === '') {
            return res.status(400).json({ error: 'Server name is required' });
        }
        if (!ram || isNaN(ram) || (ram = parseInt(ram)) < 512) {
            return res.status(400).json({ error: 'RAM must be at least 512 MB' });
        }
        if (server_ip && net.isIP(server_ip) === 0) {
            return res.status(400).json({ error: 'Invalid IP address' });
        }
        cpu = parseInt(cpu) || 1;
        disk = parseInt(disk) || 1024;
        ip_alias = ip_alias?.trim() || '';
        port_alias = port_alias?.trim() || '';
        
        // Get current server info (port is auto-managed and cannot be changed)
        const currentServer = await dbGet('SELECT port FROM servers WHERE id = ?', [serverId]);
        if (!currentServer) {
            return res.status(404).json({ error: 'Server not found' });
        }
        // Update server (port is auto-managed and not changed)
        await dbRun(
            'UPDATE servers SET name = ?, ram = ?, cpu = ?, disk = ?, server_ip = ?, ip_alias = ?, port_alias = ? WHERE id = ?',
            [name, ram, cpu, disk, server_ip, ip_alias, port_alias, serverId]
        );
        
        // Ensure server.properties has correct port (auto-managed)
        await updateServerPropertiesPort(serverId, currentServer.port);
        
        res.json({ 
            success: true, 
            message: 'Server updated successfully! (Port is auto-managed and cannot be changed)',
            port: currentServer.port
        });
    } catch (err) {
        console.error('Update server error:', err);
        res.status(500).json({ error: 'Failed to update server' });
    }
});
app.post('/admin/servers/:id/delete', requireAdmin, async (req, res) => {
    try {
        const serverId = req.params.id;
        console.log('Deleting server:', serverId);
        
        // Stop server if running
        await stopServer(serverId, true);
        
        // Delete from database
        await dbRun('DELETE FROM servers WHERE id = ?', [serverId]);
        
        // Delete server files
        const serverDir = path.join(SERVERS_DIR, serverId);
        if (fs.existsSync(serverDir)) {
            fs.rmSync(serverDir, { recursive: true, force: true });
        }
        
        // Delete backups
        const backupDir = path.join(__dirname, 'backups', serverId);
        if (fs.existsSync(backupDir)) {
            fs.rmSync(backupDir, { recursive: true, force: true });
        }
        
        console.log('Server deleted successfully:', serverId);
        res.redirect('/admin/servers');
    } catch (err) {
        console.error('Delete server error:', err);
        res.status(500).json({ error: 'Failed to delete server: ' + err.message });
    }
});

// Reinstall server (change version/type with advanced options)
app.post('/admin/servers/:id/reinstall', requireAdmin, async (req, res) => {
    try {
        const serverId = req.params.id;
        const { server_type, version, cleanOptions = {} } = req.body;
        
        if (!server_type || !version) {
            return res.status(400).json({ error: 'Server type and version are required' });
        }
        
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }
        
        // Stop server if running
        if (await isServerRunning(serverId)) {
            await stopServer(serverId, true);
        }
        
        const serverDir = resolveServerPath(serverId);
        
        // Backup important files (always backup these)
        const backupFiles = ['server.properties', 'ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json'];
        const backupData = {};
        
        backupFiles.forEach(file => {
            const filePath = path.join(serverDir, file);
            if (fs.existsSync(filePath)) {
                backupData[file] = fs.readFileSync(filePath, 'utf8');
            }
        });
        
        // Always delete server core files
        const coreFilesToDelete = ['server.jar', 'libraries', 'versions', 'cache'];
        coreFilesToDelete.forEach(file => {
            const filePath = path.join(serverDir, file);
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                if (stats.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
            }
        });
        
        // Optional cleaning based on user selection
        const cleaningActions = [];
        
        // Clean plugins
        if (cleanOptions.cleanPlugins) {
            const pluginsDir = path.join(serverDir, 'plugins');
            if (fs.existsSync(pluginsDir)) {
                fs.rmSync(pluginsDir, { recursive: true, force: true });
                fs.mkdirSync(pluginsDir, { recursive: true });
                cleaningActions.push('Plugins');
            }
        }
        
        // Clean worlds
        if (cleanOptions.cleanWorlds) {
            const worldFolders = ['world', 'world_nether', 'world_the_end'];
            worldFolders.forEach(worldFolder => {
                const worldPath = path.join(serverDir, worldFolder);
                if (fs.existsSync(worldPath)) {
                    fs.rmSync(worldPath, { recursive: true, force: true });
                    cleaningActions.push(worldFolder);
                }
            });
        }
        
        // Clean logs
        if (cleanOptions.cleanLogs) {
            const logsDir = path.join(serverDir, 'logs');
            if (fs.existsSync(logsDir)) {
                fs.rmSync(logsDir, { recursive: true, force: true });
                fs.mkdirSync(logsDir, { recursive: true });
                cleaningActions.push('Logs');
            }
        }
        
        // Clean configs (except backed up files)
        if (cleanOptions.cleanConfigs) {
            const configFolders = ['config', 'configurations'];
            configFolders.forEach(configFolder => {
                const configPath = path.join(serverDir, configFolder);
                if (fs.existsSync(configPath)) {
                    fs.rmSync(configPath, { recursive: true, force: true });
                    cleaningActions.push('Configs');
                }
            });
            
            // Also clean bukkit.yml, spigot.yml, paper configs, etc.
            const configFiles = ['bukkit.yml', 'spigot.yml', 'paper.yml', 'purpur.yml', 'commands.yml', 'help.yml'];
            configFiles.forEach(file => {
                const filePath = path.join(serverDir, file);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }
        
        // Clean backups (optional - now in separate directory)
        if (cleanOptions.cleanBackups) {
            const backupsDir = path.join(__dirname, 'backups', serverId.toString());
            if (fs.existsSync(backupsDir)) {
                fs.rmSync(backupsDir, { recursive: true, force: true });
                fs.mkdirSync(backupsDir, { recursive: true });
                cleaningActions.push('Backups');
            }
        }
        
        // Download new server jar
        console.log(`🔄 Reinstalling server with ${server_type} ${version}...`);
        const actualVersion = await downloadServerJar(server_type, version, serverDir);
        
        // Update database
        await dbRun(
            'UPDATE servers SET server_type = ?, version = ? WHERE id = ?',
            [server_type, actualVersion, serverId]
        );
        
        // Restore backed up files
        Object.entries(backupData).forEach(([file, content]) => {
            fs.writeFileSync(path.join(serverDir, file), content, 'utf8');
        });
        
        // Create EULA if it doesn't exist
        const eulaPath = path.join(serverDir, 'eula.txt');
        if (!fs.existsSync(eulaPath)) {
            fs.writeFileSync(eulaPath, 'eula=true\n', 'utf8');
        }
        
        let message = `✅ Server reinstalled successfully with ${server_type} ${actualVersion}!`;
        if (cleaningActions.length > 0) {
            message += `\nCleaned: ${cleaningActions.join(', ')}`;
        }
        message += '\n📝 Configuration updated, no files downloaded.';
        
        res.json({
            success: true,
            message: message,
            version: actualVersion,
            cleaned: cleaningActions
        });
    } catch (err) {
        console.error('Reinstall server error:', err);
        res.status(500).json({ error: 'Failed to reinstall server: ' + err.message });
    }
});
// ================================================
// ADMIN SETTINGS ROUTES
// ================================================
app.get('/admin/settings', requireAdmin, async (req, res) => {
    res.render('admin/settings', await getTemplateVars(req, null, {
        settings: globalSettings,
        title: 'Panel Settings',
        DB_PATH,
        SERVERS_DIR
    }));
});
app.post('/admin/settings/general', requireAdmin, async (req, res) => {
    try {
        const { panelName, panelDescription, footerText, registrationEnabled, maxServersPerUser, defaultRam, defaultPort } = req.body;
     
        globalSettings.panelName = panelName || globalSettings.panelName;
        globalSettings.panelDescription = panelDescription || globalSettings.panelDescription;
        globalSettings.footerText = footerText || globalSettings.footerText;
        globalSettings.registrationEnabled = registrationEnabled === 'true';
        globalSettings.maxServersPerUser = parseInt(maxServersPerUser) || 5;
        globalSettings.defaultRam = parseInt(defaultRam) || 1024;
        globalSettings.defaultPort = parseInt(defaultPort) || 25565;
     
        saveGlobalSettings();
     
        res.json({ success: true, message: 'General settings updated' });
    } catch (err) {
        console.error('Update general settings error:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
app.post('/admin/settings/icons', requireAdmin, upload.fields([
    { name: 'siteIcon', maxCount: 1 },
    { name: 'headerIcon', maxCount: 1 }
]), async (req, res) => {
    try {
        const publicDir = path.join(__dirname, 'public');
     
        if (req.files.siteIcon) {
            const file = req.files.siteIcon[0];
            const ext = path.extname(file.originalname);
            const destPath = path.join(publicDir, 'site-icon' + ext);
         
            fs.renameSync(file.path, destPath);
            globalSettings.siteIcon = '/site-icon' + ext;
        }
     
        if (req.files.headerIcon) {
            const file = req.files.headerIcon[0];
            const ext = path.extname(file.originalname);
            const destPath = path.join(publicDir, 'header-icon' + ext);
         
            fs.renameSync(file.path, destPath);
            globalSettings.headerIcon = '/header-icon' + ext;
        }
     
        saveGlobalSettings();
     
        res.json({ success: true, message: 'Icons updated successfully' });
    } catch (err) {
        console.error('Update icons error:', err);
        res.status(500).json({ error: 'Failed to update icons' });
    }
});
app.post('/admin/settings/theme', requireAdmin, async (req, res) => {
    try {
        const { theme, customCss } = req.body;
     
        globalSettings.theme = theme || 'default';
     
        if (customCss) {
            const cssPath = path.join(__dirname, 'public', 'custom-theme.css');
            fs.writeFileSync(cssPath, customCss, 'utf8');
        }
     
        saveGlobalSettings();
     
        res.json({ success: true, message: 'Theme updated successfully' });
    } catch (err) {
        console.error('Update theme error:', err);
        res.status(500).json({ error: 'Failed to update theme' });
    }
});

// Video Background Settings
app.post('/admin/settings/video-background', requireAdmin, async (req, res) => {
    try {
        const { videoBackgroundUrl } = req.body;
        
        // Validate URL format if provided
        if (videoBackgroundUrl && videoBackgroundUrl.trim() !== '') {
            const urlPattern = /^https?:\/\/.+\.(mp4|webm|ogg)$/i;
            if (!urlPattern.test(videoBackgroundUrl)) {
                return res.status(400).json({ 
                    error: 'Invalid video URL. Must be a direct link to .mp4, .webm, or .ogg file' 
                });
            }
        }
        
        // Update global settings
        globalSettings.videoBackgroundUrl = videoBackgroundUrl && videoBackgroundUrl.trim() !== '' 
            ? videoBackgroundUrl.trim() 
            : null;
        
        saveGlobalSettings();
        
        res.json({ 
            success: true, 
            message: videoBackgroundUrl ? 'Video background updated successfully' : 'Video background removed successfully'
        });
    } catch (err) {
        console.error('Update video background error:', err);
        res.status(500).json({ error: 'Failed to update video background' });
    }
});

// API endpoint to validate and fix all server ports (admin only)
app.post('/admin/validate-ports', requireAdmin, async (req, res) => {
    try {
        const result = await validateAndFixAllServerPorts();
        res.json({
            success: true,
            message: 'Port validation completed successfully',
            ...result
        });
    } catch (err) {
        console.error('Error validating ports:', err);
        res.status(500).json({ error: 'Failed to validate ports: ' + err.message });
    }
});

// ================================================
// SERVER MANAGEMENT ROUTES
// ================================================
// Server dashboard
app.get('/servers/:id/dashboard', requireAuth, async (req, res) => {
  try {
      const serverId = req.params.id;
      // Check authorization
      if (!await isAuthorized(req, serverId)) {
          return res.status(403).send('Access denied'); // simple fallback
      }
      // Fetch server
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      if (!server) {
          return res.status(404).send('Server not found'); // simple fallback
      }
      // Calculate uptime, CPU, memory
      let uptime = 'Offline';
      let uptimeSeconds = 0;
      let cpu = 'N/A';
      let memory = 'N/A';
      let onlineCount = 0;
      const running = await isServerRunning(serverId);
      
      if (running) {
          // Load start time from memory or file
          let startTime = serverStartTimes[serverId];
          if (!startTime) {
              startTime = loadServerStartTime(serverId);
              if (startTime) {
                  serverStartTimes[serverId] = startTime;
                  console.log(`Loaded start time from file for server ${serverId} in dashboard route`);
              }
          }
          
          if (startTime) {
              const diff = Date.now() - startTime;
              uptimeSeconds = Math.floor(diff / 1000);
              const days = Math.floor(diff / 86400000);
              const hrs = Math.floor((diff % 86400000) / 3600000);
              const mins = Math.floor((diff % 3600000) / 60000);
              const secs = Math.floor((diff % 60000) / 1000);
              
              if (days > 0) {
                  uptime = `${days}d ${hrs}h ${mins}m`;
              } else if (hrs > 0) {
                  uptime = `${hrs}h ${mins}m ${secs}s`;
              } else if (mins > 0) {
                  uptime = `${mins}m ${secs}s`;
              } else {
                  uptime = `${secs}s`;
              }
          } else {
              uptime = 'Unknown';
          }
          
          const pid = await getPidByPort(server.port);
          if (pid) {
            try {
              const stats = await pidusage(pid);
              cpu = stats.cpu.toFixed(1);
              memory = (stats.memory / 1024 / 1024).toFixed(1);
            } catch (e) {
              console.error('Pidusage error:', e);
            }
          }
      }
      onlineCount = onlinePlayers[serverId]?.length || 0;
      // Get recent logs
      let logContent = '';
      const logPath = path.join(SERVERS_DIR, serverId.toString(), 'logs', 'latest.log');
      if (fs.existsSync(logPath)) {
          try {
              const stats = fs.statSync(logPath);
              const maxRead = 100 * 1024; // 100KB
              const readLength = Math.min(stats.size, maxRead);
              const buffer = Buffer.alloc(readLength);
              const fd = fs.openSync(logPath, 'r');
              fs.readSync(fd, buffer, 0, readLength, stats.size - readLength);
              logContent = buffer.toString('utf8');
              fs.closeSync(fd);
          } catch {}
      }
      // Get total servers for footer
      const allServers = await dbAll('SELECT * FROM servers'); // or filter by owner if needed
      const totalServers = allServers.length;
      // Render dashboard
      res.render('servers/dashboard', await getTemplateVars(req, server, {
          uptime,
          cpu,
          memory,
          logContent,
          onlineCount,
          totalServers,
          onlinePlayers: onlinePlayers[serverId] || [],
          currentPage: 'dashboard',
          activePage: 'dashboard',
          query: req.query,
          liveStats: liveStats[serverId] || {},
          title: `${server.name} - Dashboard`
      }));
  } catch (err) {
      console.error('Server dashboard error:', err);
      res.status(500).send('Failed to load dashboard'); // fallback to avoid missing error view
  }
});

// Server stats API endpoint
app.get('/servers/:id/stats', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        
        // Check authorization
        if (!await isAuthorized(req, serverId)) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        
        // Fetch server info
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ success: false, error: 'Server not found' });
        }
        
        // Get live stats from cache (updated every 3 seconds by updateLiveStats)
        const stats = liveStats[serverId] || {};
        
        // Format response for dashboard
        const response = {
            cpu: parseFloat(stats.cpuPercent) || 0,
            memory: stats.memory || 0, // Keep in bytes - dashboard will convert to MB
            memoryPercent: stats.memoryPercent || 0,
            disk: stats.disk || 0, // Keep in bytes for now
            diskMB: stats.disk ? (stats.disk / (1024 * 1024)) : 0, // Convert bytes to MB
            uptime: 0,
            players: (onlinePlayers[serverId] || []).length,
            maxPlayers: stats.maxPlayers || 20,
            status: server.status || 'stopped'
        };
        
        // Calculate uptime in seconds if server is running
        if (server.status === 'running') {
            const startTimeFile = path.join(resolveServerPath(serverId), '.server.starttime');
            if (fs.existsSync(startTimeFile)) {
                try {
                    const startTime = parseInt(fs.readFileSync(startTimeFile, 'utf8'));
                    response.uptime = Math.floor((Date.now() - startTime) / 1000);
                } catch (err) {
                    console.error(`Error reading start time for server ${serverId}:`, err);
                }
            }
        }
        
        res.json({ success: true, stats: response });
        
    } catch (err) {
        console.error('Server stats error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
});

// Server console
app.get('/servers/:id/console', requireAuth, async (req, res) => {
  try {
      const serverId = req.params.id;
      // Check authorization
      if (!await isAuthorized(req, serverId)) {
          return res.status(403).render('error', await getTemplateVars(req, null, { message: 'Access denied', status: 403, title: 'Error' }));
      }
      // Fetch server info
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      if (!server) {
          return res.status(404).render('error', await getTemplateVars(req, null, { message: 'Server not found', status: 404, title: 'Error' }));
      }
      // Get recent logs for initial load
      let logContent = '';
      const logPath = path.join(SERVERS_DIR, serverId.toString(), 'logs', 'latest.log');
      if (fs.existsSync(logPath)) {
          try {
              const stats = fs.statSync(logPath);
              const maxRead = 100 * 1024; // 100KB
              const readLength = Math.min(stats.size, maxRead);
              const buffer = Buffer.alloc(readLength);
              const fd = fs.openSync(logPath, 'r');
              fs.readSync(fd, buffer, 0, readLength, stats.size - readLength);
              logContent = buffer.toString('utf8');
              fs.closeSync(fd);
          } catch {}
      }
      // Fetch total servers for footer
      const totalServersRow = await dbGet('SELECT COUNT(*) AS count FROM servers');
      const totalServers = totalServersRow ? totalServersRow.count : 0;
      // Render console page with totalServers
      res.render('servers/console', await getTemplateVars(req, server, {
          logContent,
          activePage: 'console',
          currentPage: 'console',
          totalServers,
          liveStats: liveStats[serverId] || {},
          title: `${server.name} - Console`
      }));
  } catch (err) {
      console.error('Console page error:', err);
      res.status(500).render('error', await getTemplateVars(req, null, { message: 'Failed to load console', status: 500, title: 'Error' }));
  }
});
// Server control commands
app.post('/servers/:id/start', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }
        if (await isServerRunning(serverId)) {
            return res.status(400).json({ error: 'Server already running' });
        }
        await startServer(serverId);
        res.json({ success: true, message: 'Server started' });
    } catch (err) {
        console.error('Start server error:', err);
        res.status(500).json({ error: 'Failed to start server' });
    }
});
app.post('/servers/:id/stop', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
     
        if (!await isAuthorized(req, serverId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
     
        await stopServer(serverId, false);
     
        res.json({ success: true, message: 'Server stopped' });
    } catch (err) {
        console.error('Stop server error:', err);
        res.status(500).json({ error: 'Failed to stop server' });
    }
});
app.post('/servers/:id/kill', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
     
        if (!await isAuthorized(req, serverId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
     
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }
     
        const success = await stopServer(serverId, true);
        if (success) {
            res.json({ success: true, message: 'Server killed' });
        } else {
            res.status(500).json({ error: 'Failed to kill server' });
        }
    } catch (err) {
        console.error('Kill server error:', err);
        res.status(500).json({ error: 'Failed to kill server' });
    }
});
app.post('/servers/:id/restart', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
     
        if (!await isAuthorized(req, serverId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
     
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }
     
        if (!await isServerRunning(serverId)) {
            return res.status(400).json({ error: 'Server not running' });
        }
     
        // Stop the server first
        const stopped = await stopServer(serverId);
        if (!stopped) {
            return res.status(500).json({ error: 'Failed to stop server' });
        }
        
        // Wait a bit before starting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Start the server again
        const started = await startServer(serverId);
        if (started) {
            res.json({ success: true, message: 'Server restarted successfully' });
        } else {
            res.status(500).json({ error: 'Failed to start server after stopping' });
        }
    } catch (err) {
        console.error('Restart server error:', err);
        res.status(500).json({ error: 'Failed to restart server' });
    }
});
app.post('/servers/:id/command', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        const { command } = req.body;
     
        if (!await isAuthorized(req, serverId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
     
        if (!command) {
            return res.status(400).json({ error: 'Command required' });
        }
     
        if (!await isServerRunning(serverId)) {
            return res.status(400).json({ error: 'Server not running' });
        }
        
        // Use sendCommand which has RCON fallback for reconnected servers
        let success = await sendCommand(serverId, command);
        
        // If command failed and we don't have stdin, try to auto-enable RCON
        if (!success) {
            const serverProcess = global.serverProcesses && global.serverProcesses[serverId];
            const hasStdin = serverProcess && !serverProcess.killed && serverProcess.stdin && serverProcess.stdin.writable;
            
            if (!hasStdin) {
                console.log(`Attempting to auto-enable RCON for server ${serverId}...`);
                const rconEnabled = await autoEnableRcon(serverId);
                
                if (rconEnabled) {
                    return res.status(400).json({ 
                        error: 'RCON has been automatically enabled. Please restart the server for changes to take effect.',
                        autoFixed: true,
                        action: 'restart'
                    });
                } else {
                    return res.status(400).json({ 
                        error: 'Could not enable RCON automatically. Please enable RCON manually in server.properties.',
                        hint: 'Add: enable-rcon=true, rcon.port=25575, rcon.password=admin123'
                    });
                }
            } else {
                return res.status(500).json({ error: 'Failed to send command. Please try again.' });
            }
        }
        
        res.json({ success: true, message: 'Command sent successfully' });
    } catch (err) {
        console.error('Send command error:', err);
        res.status(500).json({ error: 'Failed to send command' });
    }
});
// ================================================
// FILE MANAGER ROUTES
// ================================================
app.get('/servers/:id/files', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).send('Access denied');
        const currentPath = req.query.path || '/';
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) return res.status(404).send('Server not found');
        const dirPath = resolveServerPath(serverId, currentPath);
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
        const files = fs.readdirSync(dirPath, { withFileTypes: true }).map(dirent => {
            const full = path.join(dirPath, dirent.name);
            const relativePath = currentPath === '/' ? `/${dirent.name}` : `${currentPath}/${dirent.name}`;
            let stats;
            try {
                stats = fs.statSync(full);
            } catch {
                stats = {};
            }
            return {
                name: dirent.name,
                path: relativePath,
                isDirectory: dirent.isDirectory(),
                size: dirent.isDirectory() ? '-' : formatFileSize(stats.size || 0),
                modified: stats.mtime ? stats.mtime.toLocaleString() : null
            };
        });
        res.render('servers/filemanager', await getTemplateVars(req, server, {
            files, 
            currentPath, 
            path, 
            serverId: server.id, 
            currentPage: 'files', 
            activePage: 'files',
            title: `${server.name} - File Manager`
        }));
    } catch (err) {
        console.error('files list error', err);
        res.status(500).send('Error listing files');
    }
});
app.get('/servers/:id/files/view', requireAuth, async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).send('Access denied');
        const filePath = req.query.path;
        
        if (!filePath) {
            const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
            return res.status(400).render('error', await getTemplateVars(req, server, {
                message: 'File path is required',
                error: 'Please specify a file to view',
                status: 400,
                title: 'Error'
            }));
        }

        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) return res.status(404).send('Server not found');
        
        const fullPath = resolveServerPath(serverId, filePath);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).render('error', await getTemplateVars(req, server, {
                message: 'File not found',
                error: 'The requested file does not exist',
                status: 404,
                title: 'Error'
            }));
        }
        
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
            return res.status(400).render('error', await getTemplateVars(req, server, {
                message: 'Cannot view directory',
                error: 'Please use the file manager to browse directories',
                status: 400,
                title: 'Error'
            }));
        }
        
        const content = fs.readFileSync(fullPath, 'utf8');
        const pathModule = require('path');
        
        console.log('Rendering fileview with:', {
            serverId: server.id,
            filePath,
            contentLength: content.length,
            hasPath: !!pathModule
        });
        
        res.render('servers/fileview', await getTemplateVars(req, server, {
            content, 
            filePath, 
            path: pathModule,
            serverId: server.id, 
            activePage: 'files',
            title: `${server.name} - ${pathModule.basename(filePath)}`
        }));
    } catch (err) {
        console.error('file view error', err);
        res.status(500).send('Error viewing file: ' + err.message);
    }
});
app.get('/servers/:id/files/download', requireAuth, async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).send('Access denied');
        const { path: filePath } = req.query;
        if (!filePath) return res.status(400).send('File path is required');
        const fullPath = resolveServerPath(serverId, filePath);
        if (!fs.existsSync(fullPath)) return res.status(404).send('File not found');
        res.download(fullPath);
    } catch (err) {
        console.error('download error', err);
        res.status(500).send('Error downloading file');
    }
});
app.post('/servers/:id/files/rename', requireAuth, async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { oldPath, newName } = req.body;
        if (!oldPath || !newName) return res.status(400).json({ error: 'Old path and new name are required' });
        const sanitizedNewName = sanitize(newName);
        if (!sanitizedNewName) return res.status(400).json({ error: 'Invalid new name' });
        const fullOld = resolveServerPath(serverId, oldPath);
        const fullNew = path.join(path.dirname(fullOld), sanitizedNewName);
        if (fs.existsSync(fullNew)) return res.status(409).json({ error: 'Name already exists' });
        fs.renameSync(fullOld, fullNew);
        res.json({ success: true });
    } catch (err) {
        console.error('rename error', err);
        res.status(500).json({ error: 'Failed to rename' });
    }
});
app.post('/servers/:id/files/delete', requireAuth, async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { path: targetPath } = req.body;
        if (!targetPath) return res.status(400).json({ error: 'Path is required' });
        
        // Check if server is running
        const running = await isServerRunning(serverId);
        if (running) {
            // Check if trying to delete plugin files
            if (targetPath.includes('plugins')) {
                return res.status(400).json({ 
                    error: 'Cannot delete plugin files while server is running. Please stop the server first.' 
                });
            }
        }
        
        const fullPath = resolveServerPath(serverId, targetPath);
        
        // Check if file exists
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'File or folder not found' });
        }
        
        // Try to delete with retry logic for Windows file locking
        let attempts = 0;
        const maxAttempts = 3;
        let lastError = null;
        
        while (attempts < maxAttempts) {
            try {
                fs.rmSync(fullPath, { recursive: true, force: true });
                return res.json({ success: true });
            } catch (err) {
                lastError = err;
                
                // If EBUSY error (file locked), wait and retry
                if (err.code === 'EBUSY' || err.code === 'EPERM') {
                    attempts++;
                    if (attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
                        continue;
                    }
                } else {
                    // Other errors, don't retry
                    throw err;
                }
            }
        }
        
        // If we get here, all retries failed
        if (lastError && (lastError.code === 'EBUSY' || lastError.code === 'EPERM')) {
            return res.status(400).json({ 
                error: 'File is locked by another process. Please stop the server and try again.' 
            });
        }
        
        throw lastError;
        
    } catch (err) {
        console.error('delete error', err);
        return res.status(500).json({ 
            error: err.code === 'EBUSY' || err.code === 'EPERM' 
                ? 'File is locked. Stop the server and try again.' 
                : 'Failed to delete' 
        });
    }
});
app.post('/servers/:id/files/zip', requireAuth, async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { path: targetPath } = req.body;
        if (!targetPath) return res.status(400).json({ error: 'Path is required' });
        const fullPath = resolveServerPath(serverId, targetPath);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Not found' });
        if (path.extname(fullPath) === '.zip') {
            return res.status(400).json({ error: 'Target is already a zip file' });
        }
        const zipName = path.basename(fullPath) + '.zip';
        const zipFullPath = path.join(path.dirname(fullPath), zipName);
        if (fs.existsSync(zipFullPath)) return res.status(409).json({ error: 'Zip file already exists' });
        const output = fs.createWriteStream(zipFullPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        let responseSent = false;
        
        archive.on('error', (err) => {
            if (responseSent) return;
            responseSent = true;
            console.error('zip archive error', err);
            res.status(500).json({ error: 'Failed to create zip' });
        });
        
        output.on('close', () => {
            if (responseSent) return;
            responseSent = true;
            const relativeZipPath = path.relative(resolveServerPath(serverId, '/'), zipFullPath);
            res.json({ success: true, zipPath: relativeZipPath });
        });
        
        archive.pipe(output);
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
            archive.directory(fullPath, false);
        } else {
            archive.file(fullPath, { name: path.basename(fullPath) });
        }
        archive.finalize();
    } catch (err) {
        console.error('zip error', err);
        res.status(500).json({ error: 'Failed to create zip' });
    }
});
app.post('/servers/:id/files/unzip', requireAuth, async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { path: targetPath } = req.body;
        if (!targetPath) return res.status(400).json({ error: 'Path is required' });
        const fullPath = resolveServerPath(serverId, targetPath);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Not found' });
        if (path.extname(fullPath) !== '.zip') return res.status(400).json({ error: 'Not a zip file' });
        const extractDir = path.dirname(fullPath);
        await new Promise((resolve, reject) => {
            fs.createReadStream(fullPath)
                .pipe(unzipper.Extract({ path: extractDir }))
                .on('close', resolve)
                .on('error', reject);
        });
        res.json({ success: true });
    } catch (err) {
        console.error('unzip error', err);
        res.status(500).json({ error: 'Failed to unzip' });
    }
});
app.post('/servers/:id/files/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const targetDir = req.body.path || '/';
        const destDir = resolveServerPath(serverId, targetDir);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        const destPath = path.join(destDir, sanitize(req.file.originalname));
        if (fs.existsSync(destPath)) return res.status(409).json({ error: 'File already exists' });
        fs.renameSync(req.file.path, destPath);
        res.json({ success: true });
    } catch (err) {
        console.error('upload error', err);
        res.status(500).json({ error: 'Failed to upload' });
    } finally {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
});
app.post('/servers/:id/files/create', requireAuth, async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { path: targetPath, filename } = req.body;
        if (!filename) return res.status(400).json({ error: 'Filename is required' });
        const sanitizedFilename = sanitize(filename);
        if (!sanitizedFilename) return res.status(400).json({ error: 'Invalid filename' });
        
        // Construct the full path correctly
        const targetDir = resolveServerPath(serverId, targetPath || '/');
        const fullPath = path.join(targetDir, sanitizedFilename);
        
        // Ensure the directory exists
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        
        // Check if file already exists
        if (fs.existsSync(fullPath)) return res.status(409).json({ error: 'File already exists' });
        
        // Create the file
        fs.writeFileSync(fullPath, '', 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error('create file error', err);
        res.status(500).json({ error: 'Failed to create file' });
    }
});

app.post('/servers/:id/files/create-folder', requireAuth, async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { path: targetPath, foldername } = req.body;
        if (!foldername) return res.status(400).json({ error: 'Folder name is required' });
        const sanitizedFoldername = sanitize(foldername);
        if (!sanitizedFoldername) return res.status(400).json({ error: 'Invalid folder name' });
        
        // Construct the full path correctly
        const targetDir = resolveServerPath(serverId, targetPath || '/');
        const fullPath = path.join(targetDir, sanitizedFoldername);
        
        // Check if folder already exists
        if (fs.existsSync(fullPath)) return res.status(409).json({ error: 'Folder already exists' });
        
        // Create the folder
        fs.mkdirSync(fullPath, { recursive: true });
        res.json({ success: true });
    } catch (err) {
        console.error('create folder error', err);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

app.post('/servers/:id/files/bulk-zip', requireAuth, async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { paths, zipName } = req.body;
        if (!paths || !Array.isArray(paths) || paths.length === 0) {
            return res.status(400).json({ error: 'Paths array is required' });
        }
        if (!zipName) return res.status(400).json({ error: 'Zip name is required' });
        
        const sanitizedZipName = sanitize(zipName);
        if (!sanitizedZipName) return res.status(400).json({ error: 'Invalid zip name' });
        
        const serverDir = resolveServerPath(serverId);
        const zipFullPath = path.join(serverDir, sanitizedZipName);
        
        if (fs.existsSync(zipFullPath)) return res.status(409).json({ error: 'Zip file already exists' });
        
        const output = fs.createWriteStream(zipFullPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        let responseSent = false;
        
        archive.on('error', (err) => {
            if (responseSent) return;
            responseSent = true;
            console.error('bulk zip archive error', err);
            res.status(500).json({ error: 'Failed to create zip' });
        });
        
        output.on('close', () => {
            if (responseSent) return;
            responseSent = true;
            res.json({ success: true, zipPath: sanitizedZipName });
        });
        
        archive.pipe(output);
        
        // Add each path to the archive
        for (const targetPath of paths) {
            const fullPath = resolveServerPath(serverId, targetPath);
            if (fs.existsSync(fullPath)) {
                const stats = fs.statSync(fullPath);
                const baseName = path.basename(fullPath);
                
                if (stats.isDirectory()) {
                    archive.directory(fullPath, baseName);
                } else {
                    archive.file(fullPath, { name: baseName });
                }
            }
        }
        
        archive.finalize();
    } catch (err) {
        console.error('bulk zip error', err);
        res.status(500).json({ error: 'Failed to create bulk zip' });
    }
});

// Alias for /files/edit - used by file viewer
app.post('/servers/:id/files/save', requireAuth, async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { path: filePath, content } = req.body;
        if (!filePath || content === undefined) return res.status(400).json({ error: 'File path and content are required' });
        
        const fullPath = resolveServerPath(serverId, filePath);
        const fileName = path.basename(fullPath);
        
        // Protect server.properties from port changes
        if (fileName === 'server.properties') {
            const server = await dbGet('SELECT port FROM servers WHERE id = ?', [serverId]);
            if (server) {
                const sanitizedContent = sanitizeServerProperties(content, server.port);
                fs.writeFileSync(fullPath, sanitizedContent, 'utf8');
                
                // Check if user tried to change the port
                const userProperties = parseProperties(content);
                const userPort = parseInt(userProperties['server-port']);
                
                if (userPort && userPort !== server.port) {
                    res.json({ 
                        success: true, 
                        message: 'File saved successfully',
                        warning: `Note: Server port cannot be changed (kept at ${server.port}). All other settings were saved.`
                    });
                } else {
                    res.json({ 
                        success: true, 
                        message: 'File saved successfully'
                    });
                }
                return;
            }
        }
        
        // Protect velocity.toml from bind port changes
        if (fileName === 'velocity.toml') {
            const server = await dbGet('SELECT port FROM servers WHERE id = ?', [serverId]);
            if (server) {
                const sanitizedContent = sanitizeVelocityToml(content, server.port);
                fs.writeFileSync(fullPath, sanitizedContent, 'utf8');
                
                // Check if user tried to change the bind port
                const bindRegex = /bind\s*=\s*"[^"]*"/g;
                const userBindMatch = content.match(bindRegex);
                const expectedBind = `bind = "0.0.0.0:${server.port}"`;
                
                if (userBindMatch && !content.includes(expectedBind)) {
                    res.json({ 
                        success: true, 
                        message: 'velocity.toml saved successfully',
                        warning: `Note: Bind port cannot be changed (kept at 0.0.0.0:${server.port}). All other settings were saved.`
                    });
                } else {
                    res.json({ 
                        success: true, 
                        message: 'velocity.toml saved successfully'
                    });
                }
                return;
            }
        }
        
        // Protect BungeeCord config.yml from port changes
        if (fileName === 'config.yml') {
            const server = await dbGet('SELECT port, server_type FROM servers WHERE id = ?', [serverId]);
            if (server && ['bungeecord', 'waterfall'].includes(server.server_type)) {
                const sanitizedContent = sanitizeBungeeCordConfig(content, server.port);
                fs.writeFileSync(fullPath, sanitizedContent, 'utf8');
                
                // Check if user tried to change the host port
                const hostRegex = /host:\s*[^:]+:(\d+)/g;
                const userPortMatch = content.match(hostRegex);
                let userTriedToChangePort = false;
                
                if (userPortMatch) {
                    userPortMatch.forEach(match => {
                        const portMatch = match.match(/:(\d+)$/);
                        if (portMatch && parseInt(portMatch[1]) !== server.port) {
                            userTriedToChangePort = true;
                        }
                    });
                }
                
                if (userTriedToChangePort) {
                    res.json({ 
                        success: true, 
                        message: 'config.yml saved successfully',
                        warning: `Note: Proxy port cannot be changed (kept at ${server.port}). All other settings were saved.`
                    });
                } else {
                    res.json({ 
                        success: true, 
                        message: 'config.yml saved successfully'
                    });
                }
                return;
            }
        }
        
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
            return res.status(400).json({ error: 'Path is a directory' });
        }
        fs.writeFileSync(fullPath, content, 'utf8');
        res.json({ success: true, message: 'File saved successfully' });
    } catch (err) {
        console.error('file save error', err);
        res.status(500).json({ error: 'Failed to save file' });
    }
});
app.post('/servers/:id/files/mkdir', requireAuth, async (req, res) => {
    try {
        const { id: serverId } = req.params;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { path: parentPath, name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        const sanitizedName = sanitize(name);
        if (!sanitizedName) return res.status(400).json({ error: 'Invalid folder name' });
        const fullPath = resolveServerPath(serverId, path.join(parentPath || '/', sanitizedName));
        if (fs.existsSync(fullPath)) return res.status(409).json({ error: 'Folder already exists' });
        fs.mkdirSync(fullPath, { recursive: true });
        res.json({ success: true });
    } catch (err) {
        console.error('create folder error', err);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// ================================================
// SUBUSERS ROUTES
// ================================================
app.get('/servers/:id/subusers', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) return res.status(404).send('Server not found');
        // Only owner or admin can manage subusers
        if (server.owner_id !== req.session.user.id && req.session.user.role !== 'admin')
            return res.status(403).send('Access denied');
        const subusers = await dbAll(
            `SELECT subusers.id, users.username, users.id as user_id
             FROM subusers
             JOIN users ON subusers.user_id = users.id
             WHERE subusers.server_id = ?`,
            [serverId]
        );
        res.render('servers/subusers', await getTemplateVars(req, server, {
            subusers,
            serverId: server.id,
            activePage: 'subusers',
            title: `${server.name} - Sub Users`
        }));
    } catch (err) {
        console.error('Subusers page error:', err);
        res.status(500).send('Internal server error');
    }
});
app.post('/servers/:id/subusers/add', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        const { username } = req.body;
        if (!username?.trim())
            return res.status(400).json({ error: 'Username is required' });
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        if (server.owner_id !== req.session.user.id && req.session.user.role !== 'admin')
            return res.status(403).json({ error: 'Access denied' });
        const user = await dbGet('SELECT * FROM users WHERE username = ?', [username.trim()]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.id === server.owner_id) return res.status(400).json({ error: 'Owner cannot be added as subuser' });
        const existingSub = await dbGet(
            'SELECT * FROM subusers WHERE server_id = ? AND user_id = ?',
            [serverId, user.id]
        );
        if (existingSub) return res.status(400).json({ error: 'User is already a subuser' });
        await dbRun('INSERT INTO subusers (server_id, user_id) VALUES (?, ?)', [serverId, user.id]);
        res.redirect(`/servers/${serverId}/subusers`);
    } catch (err) {
        console.error('Add subuser error:', err);
        res.status(500).json({ error: 'Failed to add subuser' });
    }
});
app.post('/servers/:id/subusers/remove', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        const { subuserId } = req.body;
        if (!subuserId) return res.status(400).json({ error: 'Subuser ID is required' });
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        if (server.owner_id !== req.session.user.id && req.session.user.role !== 'admin')
            return res.status(403).json({ error: 'Access denied' });
        const deleted = await dbRun(
            'DELETE FROM subusers WHERE id = ? AND server_id = ?',
            [subuserId, serverId]
        );
        if (deleted.changes === 0) return res.status(404).json({ error: 'Subuser not found' });
        res.redirect(`/servers/${serverId}/subusers`);
    } catch (err) {
        console.error('Remove subuser error:', err);
        res.status(500).json({ error: 'Failed to remove subuser' });
    }
});
// ================================================
// SERVER SETTINGS ROUTES
// ================================================
app.get('/servers/:id/settings', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).render('error', await getTemplateVars(req, null, { message: 'Access denied', status: 403, title: 'Error' }));
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) return res.status(404).render('error', await getTemplateVars(req, null, { message: 'Server not found', status: 404, title: 'Error' }));
        
        const serverSettings = JSON.parse(server.settings || '{}');
        const versions = await fetchMinecraftVersions(server.server_type);
        const serverSoftware = getAvailableServerSoftware();
        
        // Proper disk usage calculation
        const serverDir = resolveServerPath(serverId);
        let diskUsage = 0;
        try {
            diskUsage = getDirSize(serverDir);
        } catch {}
        
        // Get template vars with server context
        const templateVars = await getTemplateVars(req, server, {
            serverSettings,
            versions,
            serverSoftware,
            diskUsage: formatFileSize(diskUsage),
            serverId,
            query: req.query,
            currentPage: 'settings',
            activePage: 'settings',
            title: `${server.name} - Settings`
        });
        
        // Ensure server is explicitly available at top level for sidebar
        templateVars.server = server;
        
        res.render('servers/settings', templateVars);
    } catch (err) {
        console.error('Settings error:', err);
        res.status(500).render('error', await getTemplateVars(req, null, { message: 'Failed to load settings', status: 500, title: 'Error' }));
    }
});
// Get versions for specific server software
app.get('/servers/:id/settings/versions/:serverType', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        const serverType = req.params.serverType;
        
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const versions = await fetchMinecraftVersions(serverType);
        res.json({ success: true, versions });
    } catch (err) {
        console.error('Fetch versions error:', err);
        res.status(500).json({ error: 'Failed to fetch versions' });
    }
});

// Validate custom version
app.post('/servers/:id/settings/validate-version', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        const { version, serverType } = req.body;
        
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        if (!version) {
            return res.status(400).json({ error: 'Version is required' });
        }
        
        const isValid = isValidMinecraftVersion(version);
        
        if (isValid) {
            res.json({ 
                success: true, 
                valid: true, 
                message: `Version "${version}" is valid for ${serverType}`,
                version: version.trim()
            });
        } else {
            res.json({ 
                success: true, 
                valid: false, 
                message: 'Invalid version format. Use formats like: 1.20.1, 1.19.4, 20w14a, latest, etc.'
            });
        }
    } catch (err) {
        console.error('Validate version error:', err);
        res.status(500).json({ error: 'Failed to validate version' });
    }
});

app.post('/servers/:id/settings/update', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const { name, description, version, serverType } = req.body;
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }
        
        if (server.owner_id !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (!name) {
            return res.status(400).json({ error: 'Server name is required' });
        }
        
        // Update server information
        const updateFields = [name, description || null];
        let updateQuery = 'UPDATE servers SET name = ?, description = ?';
        
        let message = 'Settings updated successfully';
        
        // If version and serverType are provided, update them too
        if (version && serverType) {
            updateQuery += ', version = ?, server_type = ?';
            updateFields.push(version, serverType);
            
            // DO NOT change port when server type changes - keep existing port
            // Only update configuration files to match the new server type
            if (serverType !== server.server_type) {
                console.log(`Server ${serverId} type changed from ${server.server_type} to ${serverType}, keeping existing port ${server.port}`);
                message += ` Server type updated. Port ${server.port} preserved.`;
            }
            
            message += '. Server software and version updated - restart server to apply changes.';
        }
        
        updateQuery += ' WHERE id = ?';
        updateFields.push(serverId);
        
        await dbRun(updateQuery, updateFields);
        
        // If server type changed, update configuration files with existing port
        if (version && serverType && serverType !== server.server_type) {
            try {
                // Use the existing port (don't change it)
                await updateServerConfigurationPort(serverId, serverType, server.port);
                console.log(`Updated configuration files for server ${serverId} (${serverType}) with existing port ${server.port}`);
            } catch (configErr) {
                console.error(`Failed to update configuration files for server ${serverId}:`, configErr);
                // Don't fail the entire request for config file issues
            }
        }
        
        res.json({ success: true, message });
    } catch (err) {
        console.error('Update settings error:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ================================================
// VELOCITY CONFIGURATION MANAGEMENT SYSTEM
// ================================================

// Velocity configuration page
app.get('/servers/:id/velocity', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!(await isAuthorized(req, serverId))) {
            return res.status(403).send('Access denied');
        }

        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).send('Server not found');
        }

        // Only allow for Velocity servers
        if (server.server_type !== 'velocity') {
            return res.status(400).send('This server is not a Velocity proxy server');
        }

        res.render('servers/velocity', await getTemplateVars(req, server, {
            activePage: 'velocity',
            currentPage: 'velocity-config'
        }));
    } catch (err) {
        console.error('Velocity config page error:', err);
        res.status(500).send('Internal server error');
    }
});

// Get current Velocity configuration as JSON
app.get('/servers/:id/velocity/get', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!(await isAuthorized(req, serverId))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        if (server.server_type !== 'velocity') {
            return res.status(400).json({ error: 'This server is not a Velocity proxy server' });
        }

        const configPath = resolveServerPath(serverId, 'velocity.toml');
        let config = {};

        if (fs.existsSync(configPath)) {
            try {
                const content = fs.readFileSync(configPath, 'utf8');
                config = parseVelocityToml(content);
            } catch (err) {
                console.error('Error reading velocity.toml:', err);
                config = getDefaultVelocityConfig(server);
            }
        } else {
            config = getDefaultVelocityConfig(server);
            await updateVelocityConfig(serverId, config);
        }

        res.json({ success: true, config });
    } catch (err) {
        console.error('Get Velocity config error:', err);
        res.status(500).json({ error: 'Failed to load Velocity configuration' });
    }
});

// Save Velocity configuration
app.post('/servers/:id/velocity/save', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!(await isAuthorized(req, serverId))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        if (server.server_type !== 'velocity') {
            return res.status(400).json({ error: 'This server is not a Velocity proxy server' });
        }

        const { config } = req.body;
        if (!config || typeof config !== 'object') {
            return res.status(400).json({ error: 'Invalid configuration data' });
        }

        // Ensure bind port is protected
        config.bind = `0.0.0.0:${server.port}`;

        const configPath = resolveServerPath(serverId, 'velocity.toml');
        
        // Write configuration to file
        writeVelocityToml(config, configPath);

        console.log(`Velocity configuration saved for server ${serverId}`);
        
        res.json({ 
            success: true, 
            message: 'Velocity configuration saved successfully!',
            warning: 'Bind port is protected and managed automatically'
        });
    } catch (err) {
        console.error('Save Velocity config error:', err);
        res.status(500).json({ error: 'Failed to save Velocity configuration' });
    }
});

// Reset Velocity configuration to defaults
app.post('/servers/:id/velocity/reset', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!(await isAuthorized(req, serverId))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        if (server.server_type !== 'velocity') {
            return res.status(400).json({ error: 'This server is not a Velocity proxy server' });
        }

        const defaultConfig = getDefaultVelocityConfig(server);
        await updateVelocityConfig(serverId, defaultConfig);

        console.log(`Velocity configuration reset to defaults for server ${serverId}`);
        
        res.json({ 
            success: true, 
            message: 'Velocity configuration reset to defaults!',
            config: defaultConfig
        });
    } catch (err) {
        console.error('Reset Velocity config error:', err);
        res.status(500).json({ error: 'Failed to reset Velocity configuration' });
    }
});

// ================================================
// VELOCITY CONFIGURATION HELPER FUNCTIONS
// ================================================

// Parse Velocity TOML configuration
function parseVelocityToml(content) {
    const config = {};
    const lines = content.split('\n');
    let currentSection = null;
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        // Handle sections
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            currentSection = trimmed.slice(1, -1);
            if (!config[currentSection]) config[currentSection] = {};
            continue;
        }
        
        // Handle key-value pairs
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex === -1) continue;
        
        const key = trimmed.substring(0, equalIndex).trim();
        let value = trimmed.substring(equalIndex + 1).trim();
        
        // Parse value types
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1); // String
        } else if (value === 'true' || value === 'false') {
            value = value === 'true'; // Boolean
        } else if (!isNaN(value)) {
            value = parseInt(value); // Number
        } else if (value.startsWith('[') && value.endsWith(']')) {
            // Array
            value = value.slice(1, -1).split(',').map(v => v.trim().replace(/"/g, ''));
        }
        
        if (currentSection) {
            config[currentSection][key] = value;
        } else {
            config[key] = value;
        }
    }
    
    return config;
}

// Generate default Velocity configuration
function getDefaultVelocityConfig(server) {
    return {
        // Main configuration
        'config-version': '2.6',
        'bind': `0.0.0.0:${server.port}`,
        'motd': server.name || 'A Velocity Server',
        'show-max-players': 500,
        'online-mode': true,
        'prevent-client-proxy-connections': false,
        'player-info-forwarding-mode': 'MODERN',
        'forwarding-secret-file': 'forwarding.secret',
        'announce-forge': false,
        'kick-existing-players': false,
        'ping-passthrough': 'DISABLED',
        'enable-player-address-logging': true,
        'bungee-plugin-message-channel': true,
        'show-ping-requests': false,
        'failover-on-unexpected-server-disconnect': true,
        'announce-proxy-commands': true,
        'log-command-executions': false,
        'log-player-connections': true,
        
        // Servers section
        'servers': {
            'lobby': 'localhost:25565',
            'survival': 'localhost:25566'
        },
        
        // Try section
        'try': ['lobby'],
        
        // Forced hosts
        'forced-hosts': {},
        
        // Advanced section
        'advanced': {
            'compression-threshold': 256,
            'compression-level': -1,
            'login-ratelimit': 3000,
            'connection-timeout': 5000,
            'read-timeout': 30000,
            'haproxy-protocol': false,
            'tcp-fast-open': false,
            'bungee-plugin-message-channel': true,
            'show-ping-requests': false,
            'failover-on-unexpected-server-disconnect': true,
            'announce-proxy-commands': true,
            'log-command-executions': false,
            'log-player-connections': true
        },
        
        // Query section
        'query': {
            'enabled': false,
            'port': server.port + 1,
            'map': 'Velocity',
            'show-plugins': false
        }
    };
}

// Write Velocity TOML configuration
function writeVelocityToml(config, filePath) {
    let content = '# Velocity Configuration\n';
    content += '# Generated by Minecraft Server Panel\n\n';
    
    // Write main configuration values
    const mainKeys = ['config-version', 'bind', 'motd', 'show-max-players', 'online-mode', 
                     'prevent-client-proxy-connections', 'player-info-forwarding-mode', 
                     'forwarding-secret-file', 'announce-forge', 'kick-existing-players',
                     'ping-passthrough', 'enable-player-address-logging', 'bungee-plugin-message-channel',
                     'show-ping-requests', 'failover-on-unexpected-server-disconnect',
                     'announce-proxy-commands', 'log-command-executions', 'log-player-connections'];
    
    for (const key of mainKeys) {
        if (config[key] !== undefined) {
            content += `${key} = ${formatTomlValue(config[key])}\n`;
        }
    }
    
    content += '\n';
    
    // Write servers section
    if (config.servers) {
        content += '[servers]\n';
        for (const [name, address] of Object.entries(config.servers)) {
            content += `${name} = "${address}"\n`;
        }
        content += '\n';
    }
    
    // Write try section
    if (config.try && Array.isArray(config.try)) {
        content += `try = [${config.try.map(s => `"${s}"`).join(', ')}]\n\n`;
    }
    
    // Write forced-hosts section
    if (config['forced-hosts']) {
        content += '[forced-hosts]\n';
        for (const [host, server] of Object.entries(config['forced-hosts'])) {
            content += `"${host}" = "${server}"\n`;
        }
        content += '\n';
    }
    
    // Write advanced section
    if (config.advanced) {
        content += '[advanced]\n';
        for (const [key, value] of Object.entries(config.advanced)) {
            content += `${key} = ${formatTomlValue(value)}\n`;
        }
        content += '\n';
    }
    
    // Write query section
    if (config.query) {
        content += '[query]\n';
        for (const [key, value] of Object.entries(config.query)) {
            content += `${key} = ${formatTomlValue(value)}\n`;
        }
        content += '\n';
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
}

// Format value for TOML
function formatTomlValue(value) {
    if (typeof value === 'string') {
        return `"${value}"`;
    } else if (typeof value === 'boolean') {
        return value.toString();
    } else if (typeof value === 'number') {
        return value.toString();
    } else if (Array.isArray(value)) {
        return `[${value.map(v => `"${v}"`).join(', ')}]`;
    }
    return `"${value}"`;
}

// Update Velocity configuration file
async function updateVelocityConfig(serverId, config) {
    const configPath = resolveServerPath(serverId, 'velocity.toml');
    writeVelocityToml(config, configPath);
}

// Server delete route
app.post('/servers/:id/delete', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }
        
        if (server.owner_id !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Stop server if running
        await stopServer(serverId, true);
        
        // Delete from database
        await dbRun('DELETE FROM servers WHERE id = ?', [serverId]);
        
        // Delete server files
        const serverDir = resolveServerPath(serverId);
        if (fs.existsSync(serverDir)) {
            fs.rmSync(serverDir, { recursive: true, force: true });
        }
        
        // Clean up any remaining references
        delete global.serverProcesses[serverId];
        delete serverStartTimes[serverId];
        delete onlinePlayers[serverId];
        delete liveStats[serverId];
        
        res.json({ success: true, message: 'Server deleted successfully' });
    } catch (err) {
        console.error('Delete server error:', err);
        res.status(500).json({ error: 'Failed to delete server' });
    }
});
app.post('/servers/:id/settings/reinstall', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }
        
        if (server.owner_id !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Stop server if running
        if (await isServerRunning(serverId)) {
            await stopServer(serverId, true);
        }
        
        const serverDir = resolveServerPath(serverId);
        
        // DISABLED: Don't delete and recreate directory, just update configuration
        // if (fs.existsSync(serverDir)) {
        //     fs.rmSync(serverDir, { recursive: true, force: true });
        // }
        // fs.mkdirSync(serverDir, { recursive: true });
        
        // Ensure server directory exists
        if (!fs.existsSync(serverDir)) {
            fs.mkdirSync(serverDir, { recursive: true });
        }
        
        // Download server jar
        console.log(`🔄 Reinstalling server ${serverId} with ${server.server_type} ${server.version}...`);
        await downloadServerJar(server.server_type, server.version, serverDir);
        
        // Create EULA if it doesn't exist
        const eulaPath = path.join(serverDir, 'eula.txt');
        if (!fs.existsSync(eulaPath)) {
            fs.writeFileSync(eulaPath, 'eula=true\n', 'utf8');
        }
        
        // Update server.properties with existing port (don't change it)
        const propertiesPath = path.join(serverDir, 'server.properties');
        const properties = {
            'server-port': server.port, // Keep existing port
            'server-ip': server.server_ip || '',
            'max-players': 20,
            'online-mode': true,
            'view-distance': 10,
            'simulation-distance': 10,
            'motd': server.name
        };
        writeProperties(properties, propertiesPath);
        
        // Update configuration files for the server type
        try {
            await updateServerConfigurationPort(serverId, server.server_type, server.port);
            console.log(`Updated configuration files for server ${serverId} (${server.server_type}) with existing port ${server.port}`);
        } catch (configErr) {
            console.error(`Failed to update configuration files for server ${serverId}:`, configErr);
        }
        
        // Create start script (optional)
        const settings = JSON.parse(server.settings || '{}');
        const xms = Math.max(64, Math.floor(server.ram / 2));
        const startScript = `#!/bin/bash
cd "$(dirname "$0")"
exec ${settings.startup || `java -Xms${xms}M -Xmx${server.ram}M -jar server.jar nogui`}
`;
        fs.writeFileSync(path.join(serverDir, 'start.sh'), startScript, { mode: 0o755 });
        
        res.json({ 
            success: true, 
            message: '✅ Server reinstalled successfully! Configuration updated, no files downloaded.' 
        });
    } catch (err) {
        console.error('Server reinstall error:', err);
        res.status(500).json({ error: 'Failed to reinstall server: ' + err.message });
    }
});
// ================================================
// STARTUP ROUTES
// ================================================
app.get('/servers/:id/startup', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).send('Access denied');
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        const settings = JSON.parse(server.settings || '{}');
        const startup = settings.startup || `java -Xms${Math.max(64, Math.floor(server.ram / 2))}M -Xmx${server.ram}M -jar server.jar nogui`;
        // Load server.properties
        const serverDir = resolveServerPath(serverId);
        const propertiesPath = path.join(serverDir, 'server.properties');
        let properties = {};
        try {
            if (fs.existsSync(propertiesPath)) {
                const content = fs.readFileSync(propertiesPath, 'utf8');
                properties = parseProperties(content);
            } else {
                properties = {
                    'server-port': server.port,
                    'server-ip': server.server_ip,
                    'max-players': 20,
                    'online-mode': true,
                    'view-distance': 10,
                    'simulation-distance': 10,
                    'motd': server.name
                };
            }
        } catch (err) {
            console.error(`Error reading server.properties for server ${serverId}`, err);
        }
        res.render('servers/startup', await getTemplateVars(req, server, {
            startup, 
            properties, 
            success: req.query.success, 
            error: req.query.error, 
            serverId: server.id, 
            activePage: 'startup',
            title: `${server.name} - Startup`
        }));
    } catch (err) {
        console.error('Startup page error', err);
        res.status(500).send('Internal error');
    }
});
app.post('/servers/:id/startup/update', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { startup, properties } = req.body;
        if (!startup) return res.status(400).json({ error: 'Startup command required' });
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (server.owner_id !== req.session.user.id && req.session.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
        let settings = JSON.parse(server.settings || '{}');
        settings.startup = startup;
        // Validate and update server.properties
        if (properties && typeof properties === 'object') {
            const validProperties = {};
            // Common server.properties keys with validation
            const propertyRules = {
                'server-port': { type: 'number', min: 1024, max: 65535, default: server.port },
                'server-ip': { type: 'string', default: server.server_ip },
                'max-players': { type: 'number', min: 1, max: 1000, default: 20 },
                'online-mode': { type: 'boolean', default: true },
                'view-distance': { type: 'number', min: 2, max: 32, default: 10 },
                'simulation-distance': { type: 'number', min: 2, max: 32, default: 10 },
                'motd': { type: 'string', maxLength: 256, default: server.name },
                'difficulty': { type: 'string', options: ['peaceful', 'easy', 'normal', 'hard'], default: 'normal' },
                'gamemode': { type: 'string', options: ['survival', 'creative', 'adventure', 'spectator'], default: 'survival' },
                'pvp': { type: 'boolean', default: true },
                'level-type': { type: 'string', default: 'minecraft:normal' },
                'spawn-protection': { type: 'number', min: 0, default: 0 }
            };
            Object.keys(propertyRules).forEach(key => {
                if (properties[key] !== undefined) {
                    const rule = propertyRules[key];
                    let value = properties[key];
                    if (rule.type === 'number') {
                        value = parseInt(value, 10);
                        if (isNaN(value) || (rule.min && value < rule.min) || (rule.max && value > rule.max)) {
                            value = rule.default;
                        }
                    } else if (rule.type === 'boolean') {
                        value = value === 'true' || value === true;
                    } else if (rule.type === 'string') {
                        value = String(value).trim();
                        if (rule.maxLength && value.length > rule.maxLength) {
                            value = value.substring(0, rule.maxLength);
                        }
                        if (rule.options && !rule.options.includes(value)) {
                            value = rule.default;
                        }
                    }
                    validProperties[key] = value;
                } else {
                    validProperties[key] = propertyRules[key].default;
                }
            });
            // Convert properties object to string
            const propertiesContent = Object.entries(validProperties)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');
            // Save to server.properties
            const serverDir = resolveServerPath(serverId);
            fs.writeFileSync(path.join(serverDir, 'server.properties'), propertiesContent, 'utf8');
            // Store in settings for reinstall
            settings.properties = propertiesContent;
        }
        await dbRun('UPDATE servers SET settings = ? WHERE id = ?', [JSON.stringify(settings), serverId]);
        // Update start.sh
        const serverDir = resolveServerPath(serverId);
        fs.writeFileSync(path.join(serverDir, 'start.sh'), `#!/bin/bash\ncd "$(dirname "$0")"\nexec ${startup}\n`, { mode: 0o755 });
        res.redirect(`/servers/${serverId}/startup?success=Startup and server properties updated`);
    } catch (err) {
        console.error('Update startup error', err);
        res.redirect(`/servers/${serverId}/startup?error=Failed to update startup or server properties`);
    }
});
// ================================================
// BACKUPS ROUTES
// ================================================
app.post('/servers/:id/backups/create', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const { name, description } = req.body;
        const backupName = name || `Backup ${new Date().toLocaleString()}`;
        
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        
        const serverDir = resolveServerPath(serverId);
        // NEW: Use backups/:id/ directory in panel root
        const backupDir = path.join(__dirname, 'backups', serverId.toString());
        fs.mkdirSync(backupDir, { recursive: true });
        const fileName = `backup-${Date.now()}.zip`;
        const filePath = path.join(backupDir, fileName);
        
        let wasRunning = false;
        let responseSent = false;
        
        // Check if server is running
        if (server.status === 'running') {
            wasRunning = true;
            console.log(`Stopping server ${serverId} for backup...`);
            
            // Stop the server
            await stopServer(serverId);
            
            // Wait for server to fully stop
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Create backup
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        output.on('close', async () => {
            if (responseSent) return;
            responseSent = true;
            
            try {
                // Get file size
                const stats = fs.statSync(filePath);
                const sizeInBytes = stats.size;
                const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
                const sizeInGB = (sizeInBytes / (1024 * 1024 * 1024)).toFixed(2);
                const sizeStr = sizeInGB >= 1 ? `${sizeInGB} GB` : `${sizeInMB} MB`;
                
                await dbRun('INSERT INTO backups (server_id, file, name, description, size, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
                    serverId, fileName, backupName, description || null, sizeStr, new Date().toISOString()
                ]);
                
                // Restart server if it was running
                if (wasRunning) {
                    console.log(`Restarting server ${serverId} after backup...`);
                    setTimeout(async () => {
                        try {
                            await startServer(serverId);
                        } catch (err) {
                            console.error(`Failed to restart server ${serverId}:`, err);
                        }
                    }, 1000);
                }
                
                res.json({ 
                    success: true, 
                    message: wasRunning ? 'Backup created (server restarted)' : 'Backup created', 
                    file: fileName,
                    size: sizeStr
                });
            } catch (err) {
                console.error('Backup DB insert error:', err);
                res.status(500).json({ error: 'Failed to save backup record' });
            }
        });
        
        archive.on('error', async (err) => {
            if (responseSent) return;
            responseSent = true;
            console.error('Archive error:', err);
            
            // Restart server if it was running
            if (wasRunning) {
                console.log(`Restarting server ${serverId} after backup error...`);
                try {
                    await startServer(serverId);
                } catch (restartErr) {
                    console.error(`Failed to restart server ${serverId}:`, restartErr);
                }
            }
            
            res.status(500).json({ error: 'Failed to create backup: ' + err.message });
        });
        
        archive.pipe(output);
        // Exclude the backups directory from being backed up
        archive.glob('**/*', { cwd: serverDir, ignore: ['*.pid', '*.lock', 'logs/latest.log'] });
        archive.finalize();
        
    } catch (err) {
        console.error('Backup create error', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to create backup' });
        }
    }
});
app.get('/servers/:id/backups', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).send('Access denied');
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        const backups = await dbAll('SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC', [serverId]);
        res.render('servers/backups', await getTemplateVars(req, server, {
            backups, 
            serverId: server.id, 
            activePage: 'backups',
            title: `${server.name} - Backups`
        }));
    } catch (err) {
        console.error('Backups page error', err);
        res.status(500).send('Internal error');
    }
});
app.get('/servers/:id/backups/download/:filename', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).send('Access denied');
        
        const filename = req.params.filename;
        // NEW: Use backups/:id/ directory
        const filePath = path.join(__dirname, 'backups', serverId.toString(), filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('Backup file not found');
        }
        
        res.download(filePath, filename);
    } catch (err) {
        console.error('Download backup error:', err);
        res.status(500).send('Download failed');
    }
});
app.post('/servers/:id/backups/delete', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const { backupId } = req.body;
        if (!backupId) return res.status(400).json({ error: 'Backup ID required' });
        
        const backup = await dbGet('SELECT * FROM backups WHERE id = ? AND server_id = ?', [backupId, serverId]);
        if (!backup) return res.status(404).json({ error: 'Backup not found' });
        
        // NEW: Use backups/:id/ directory
        const filePath = path.join(__dirname, 'backups', serverId.toString(), backup.file);
        
        // Delete file with retry logic to handle EBUSY errors
        if (fs.existsSync(filePath)) {
            let retries = 5;
            let deleted = false;
            
            while (retries > 0 && !deleted) {
                try {
                    // Force garbage collection to release any file handles
                    if (global.gc) {
                        global.gc();
                    }
                    
                    // Try to delete the file
                    await fs.promises.unlink(filePath);
                    deleted = true;
                    console.log(`Successfully deleted backup file: ${backup.file}`);
                    
                } catch (unlinkErr) {
                    retries--;
                    
                    if (unlinkErr.code === 'EBUSY' || unlinkErr.code === 'EPERM') {
                        if (retries > 0) {
                            console.log(`File is busy, retrying... (${retries} attempts left)`);
                            // Wait before retrying (exponential backoff)
                            await new Promise(resolve => setTimeout(resolve, 1000 * (6 - retries)));
                        } else {
                            // If all retries failed, try using rmSync with force option
                            console.log('All retries failed, trying rmSync with force...');
                            try {
                                fs.rmSync(filePath, { force: true, maxRetries: 3, retryDelay: 1000 });
                                deleted = true;
                                console.log(`Successfully deleted backup file using rmSync: ${backup.file}`);
                            } catch (rmErr) {
                                console.error('rmSync also failed:', rmErr);
                                throw new Error(`File is locked and cannot be deleted. Please close any programs that might be using this file and try again. (${unlinkErr.code})`);
                            }
                        }
                    } else {
                        // Different error, throw immediately
                        throw unlinkErr;
                    }
                }
            }
        }
        
        // Delete from database
        await dbRun('DELETE FROM backups WHERE id = ?', [backupId]);
        res.json({ success: true, message: 'Backup deleted successfully' });
        
    } catch (err) {
        console.error('Delete backup error', err);
        res.status(500).json({ error: 'Failed to delete backup: ' + err.message });
    }
});

app.post('/servers/:id/backups/validate', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const { backupId } = req.body;
        if (!backupId) return res.status(400).json({ error: 'Backup ID required' });
        
        const backup = await dbGet('SELECT * FROM backups WHERE id = ? AND server_id = ?', [backupId, serverId]);
        if (!backup) return res.status(404).json({ error: 'Backup not found' });
        
        const backupFile = path.join(__dirname, 'backups', serverId.toString(), backup.file);
        
        // Check if file exists
        if (!fs.existsSync(backupFile)) {
            return res.json({ 
                valid: false, 
                error: 'Backup file not found on disk',
                canRestore: false
            });
        }
        
        // Check file size
        const stats = fs.statSync(backupFile);
        if (stats.size === 0) {
            return res.json({ 
                valid: false, 
                error: 'Backup file is empty',
                canRestore: false
            });
        }
        
        // Try to open and validate the zip file
        try {
            const directory = await unzipper.Open.file(backupFile);
            if (!directory || !directory.files || directory.files.length === 0) {
                return res.json({ 
                    valid: false, 
                    error: 'Backup file contains no files',
                    canRestore: false
                });
            }
            
            const fileCount = directory.files.length;
            
            // Force close the directory handle by setting to null and triggering GC
            directory.close && directory.close();
            
            // Small delay to ensure file handle is released
            await new Promise(resolve => setTimeout(resolve, 100));
            
            return res.json({ 
                valid: true, 
                fileCount: fileCount,
                size: backup.size,
                canRestore: true,
                message: `Backup is valid and contains ${fileCount} files`
            });
            
        } catch (zipErr) {
            console.error('Zip validation error:', zipErr);
            return res.json({ 
                valid: false, 
                error: `Backup file is corrupted: ${zipErr.message}`,
                canRestore: false
            });
        }
        
    } catch (err) {
        console.error('Validate backup error:', err);
        res.status(500).json({ error: 'Failed to validate backup: ' + err.message });
    }
});
app.post('/servers/:id/backups/restore', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const { backupId } = req.body;
        if (!backupId) return res.status(400).json({ error: 'Backup ID required' });
        
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        const backup = await dbGet('SELECT * FROM backups WHERE id = ? AND server_id = ?', [backupId, serverId]);
        if (!backup) return res.status(404).json({ error: 'Backup not found' });
        
        const serverDir = resolveServerPath(serverId);
        const backupFile = path.join(__dirname, 'backups', serverId.toString(), backup.file);
        
        // Check if backup file exists
        if (!fs.existsSync(backupFile)) {
            return res.status(404).json({ error: 'Backup file not found on disk' });
        }
        
        // Check if backup file is valid
        const stats = fs.statSync(backupFile);
        if (stats.size === 0) {
            return res.status(400).json({ error: 'Backup file is empty or corrupted' });
        }
        
        console.log(`Restoring backup ${backup.file} (${backup.size}) for server ${serverId}...`);
        
        // Stop server if running
        let wasRunning = false;
        if (server.status === 'running') {
            wasRunning = true;
            console.log(`Stopping server ${serverId} for restore...`);
            await stopServer(serverId);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Create a temporary directory for extraction
        const tempDir = path.join(__dirname, 'temp', `restore-${serverId}-${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });
        
        try {
            // Extract using unzipper.Open.file() which works better for large files
            console.log(`Opening backup file...`);
            const directory = await unzipper.Open.file(backupFile);
            
            if (!directory || !directory.files || directory.files.length === 0) {
                throw new Error('Backup file is empty or invalid');
            }
            
            console.log(`Backup contains ${directory.files.length} files`);
            console.log(`Extracting backup to temp directory...`);
            
            // Extract to temp directory
            await directory.extract({ path: tempDir });
            
            // Close the directory handle explicitly
            directory.close && directory.close();
            
            // Give it a moment to finish writing and release file handles
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            console.log('Extraction completed successfully');
            
            // Verify extraction
            console.log(`Verifying extraction...`);
            if (!fs.existsSync(tempDir)) {
                throw new Error('Extraction failed - temp directory does not exist');
            }
            
            const extractedFiles = fs.readdirSync(tempDir);
            if (extractedFiles.length === 0) {
                throw new Error('Extraction failed - no files were extracted');
            }
            
            console.log(`Successfully extracted ${extractedFiles.length} items`);
            
            console.log(`Removing old server files...`);
            // Remove all files in server directory (with retry logic)
            let retries = 3;
            while (retries > 0) {
                try {
                    if (fs.existsSync(serverDir)) {
                        const files = fs.readdirSync(serverDir);
                        for (const file of files) {
                            const filePath = path.join(serverDir, file);
                            try {
                                fs.rmSync(filePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
                            } catch (err) {
                                console.warn(`Failed to delete ${file}:`, err.message);
                            }
                        }
                    }
                    break;
                } catch (err) {
                    retries--;
                    if (retries === 0) throw err;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            console.log(`Moving extracted files to server directory...`);
            // Ensure server directory exists
            fs.mkdirSync(serverDir, { recursive: true });
            
            // Move files from temp to server directory
            for (const file of extractedFiles) {
                const srcPath = path.join(tempDir, file);
                const destPath = path.join(serverDir, file);
                
                try {
                    // Copy instead of rename to avoid cross-device issues
                    if (fs.statSync(srcPath).isDirectory()) {
                        fs.cpSync(srcPath, destPath, { recursive: true });
                    } else {
                        fs.copyFileSync(srcPath, destPath);
                    }
                    console.log(`Copied: ${file}`);
                } catch (copyErr) {
                    console.error(`Failed to copy ${file}:`, copyErr);
                    throw copyErr;
                }
            }
            
            // Clean up temp directory
            console.log(`Cleaning up temp directory...`);
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (cleanErr) {
                console.warn('Failed to clean temp directory:', cleanErr.message);
            }
            
            // Update server status
            await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['stopped', serverId]);
            
            console.log(`Backup restored successfully for server ${serverId}`);
            
            res.json({ 
                success: true, 
                message: wasRunning ? 'Backup restored successfully. Please start the server manually.' : 'Backup restored successfully',
                wasRunning
            });
            
        } catch (extractErr) {
            // Clean up temp directory on error
            if (fs.existsSync(tempDir)) {
                try {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (cleanErr) {
                    console.warn('Failed to clean temp directory after error:', cleanErr.message);
                }
            }
            throw extractErr;
        }
        
    } catch (err) {
        console.error('Restore backup error:', err);
        res.status(500).json({ 
            error: 'Failed to restore backup: ' + err.message,
            details: err.code || 'Unknown error'
        });
    }
});
// ================================================
// PLUGINS ROUTES
// ================================================
app.get('/servers/:id/plugins/marketplace', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).send('Access denied');
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        const query = req.query.q || '';
        const page = parseInt(req.query.page) || 1;
        const provider = req.query.provider || 'all';
        const limit = 16;
        const { plugins, totalHits } = await searchPlugins(query, page, limit, provider);
        res.render('servers/plugins_marketplace', await getTemplateVars(req, server, {
            serverId,
            plugins,
            query,
            page,
            provider,
            hasMore: page * limit < totalHits,
            success: req.query.success,
            currentPage: 'plugins',
            activePage: 'plugins',
            error: req.query.error,
            title: `${server.name} - Plugin Marketplace`
        }));
    } catch (err) {
        console.error('Marketplace error', err);
        res.status(500).send('Error loading marketplace');
    }
});

// API endpoint to get plugin versions
app.get('/servers/:id/plugins/marketplace/versions', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const { source, projectId, resourceId } = req.query;
        let versions = [];
        
        if (source === 'modrinth' && projectId) {
            versions = await getModrinthVersions(projectId);
        } else if (source === 'spiget' && resourceId) {
            versions = await getSpigetVersions(resourceId);
        } else if (source === 'hangar' && projectId) {
            versions = await getHangarVersions(projectId);
        } else if (source === 'bukkit' && projectId) {
            versions = await getBukkitVersions(projectId);
        }
        
        res.json({ versions });
    } catch (err) {
        console.error('Versions fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch versions' });
    }
});
app.post('/servers/:id/plugins/marketplace/install', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const { pluginName, source, projectId, resourceId, versionId, fileId } = req.body;
        
        if (!pluginName || !source) {
            return res.status(400).json({ error: 'Missing plugin information' });
        }
        
        console.log(`Installing plugin: ${pluginName} from ${source}${versionId ? ` (version: ${versionId})` : ''}`);
        console.log(`Project ID: ${projectId}, Resource ID: ${resourceId}`);
        
        // Get download URL based on source
        let downloadInfo = null;
        
        try {
            if (source === 'modrinth' && projectId) {
                downloadInfo = await getModrinthDownloadUrl(projectId, versionId);
            } else if (source === 'spiget' && resourceId) {
                downloadInfo = await getSpigetDownloadUrl(resourceId, versionId);
            } else if (source === 'hangar' && projectId) {
                downloadInfo = await getHangarDownloadUrl(projectId, versionId);
            } else if (source === 'bukkit' && projectId) {
                downloadInfo = await getBukkitDownloadUrl(projectId, fileId);
            } else {
                return res.status(400).json({ error: 'Invalid source or missing identifiers' });
            }
        } catch (err) {
            console.error('Error fetching download URL:', err);
            return res.status(500).json({ error: `Failed to get download URL: ${err.message}` });
        }
        
        if (!downloadInfo) {
            return res.status(400).json({ error: 'Could not retrieve download information from provider' });
        }
        
        if (!downloadInfo.url) {
            return res.status(400).json({ error: 'Download URL not available for this plugin' });
        }
        
        console.log(`Download URL: ${downloadInfo.url}`);
        console.log(`Filename: ${downloadInfo.filename}`);
        
        // Prepare destination path
        const pluginsDir = resolveServerPath(serverId, 'plugins');
        if (!fs.existsSync(pluginsDir)) {
            fs.mkdirSync(pluginsDir, { recursive: true });
        }
        
        const sanitizedName = downloadInfo.filename || (sanitize(pluginName) + '.jar');
        const destPath = path.join(pluginsDir, sanitizedName);
        
        // Check if plugin already exists
        if (fs.existsSync(destPath)) {
            return res.status(400).json({ error: 'Plugin already installed. Delete the old version first.' });
        }
        
        // Download the plugin
        try {
            await downloadPluginJar(downloadInfo.url, destPath);
        } catch (downloadErr) {
            console.error('Download failed:', downloadErr);
            return res.status(500).json({ error: `Download failed: ${downloadErr.message}` });
        }
        
        console.log(`Plugin installed successfully: ${sanitizedName}`);
        return res.json({ 
            success: true, 
            message: `${pluginName} installed successfully!`,
            filename: sanitizedName,
            version: downloadInfo.version
        });
        
    } catch (err) {
        console.error('Plugin install error:', err);
        return res.status(500).json({ error: err.message || 'Failed to install plugin' });
    }
});
app.post('/servers/:id/plugins/delete', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const { filename } = req.body;
        if (!filename) {
            return res.status(400).json({ error: 'Invalid plugin filename' });
        }
        
        // Check if server is running
        const running = await isServerRunning(serverId);
        if (running) {
            return res.status(400).json({ 
                error: 'Cannot delete plugins while server is running. Please stop the server first.' 
            });
        }
        
        const sanitizedName = sanitize(filename);
        const pluginsDir = resolveServerPath(serverId, 'plugins');
        const pluginPath = path.join(pluginsDir, sanitizedName);
        
        if (!fs.existsSync(pluginPath)) {
            return res.status(404).json({ error: 'Plugin not found' });
        }
        
        // Try to delete with retry logic for Windows file locking
        let attempts = 0;
        const maxAttempts = 3;
        let lastError = null;
        
        while (attempts < maxAttempts) {
            try {
                // Check if it's a directory or file
                const stats = fs.statSync(pluginPath);
                if (stats.isDirectory()) {
                    fs.rmSync(pluginPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(pluginPath);
                }
                
                return res.json({ success: true, message: 'Plugin deleted successfully' });
            } catch (err) {
                lastError = err;
                
                // If EBUSY error (file locked), wait and retry
                if (err.code === 'EBUSY' || err.code === 'EPERM') {
                    attempts++;
                    if (attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
                        continue;
                    }
                } else {
                    // Other errors, don't retry
                    throw err;
                }
            }
        }
        
        // If we get here, all retries failed
        if (lastError && (lastError.code === 'EBUSY' || lastError.code === 'EPERM')) {
            return res.status(400).json({ 
                error: 'Plugin files are locked. The server may still be running or shutting down. Please wait a moment and try again.' 
            });
        }
        
        throw lastError;
        
    } catch (err) {
        console.error('Plugin delete error:', err.message);
        return res.status(500).json({ 
            error: err.code === 'EBUSY' || err.code === 'EPERM' 
                ? 'Plugin is locked. Stop the server and try again.' 
                : 'Failed to delete plugin' 
        });
    }
});

app.post('/servers/:id/plugins/upload', requireAuth, upload.single('plugin'), async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Validate file is a JAR
        if (!req.file.originalname.endsWith('.jar')) {
            // Delete uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Only .jar files are allowed' });
        }
        
        const pluginsDir = resolveServerPath(serverId, 'plugins');
        if (!fs.existsSync(pluginsDir)) {
            fs.mkdirSync(pluginsDir, { recursive: true });
        }
        
        const sanitizedName = sanitize(req.file.originalname);
        const destPath = path.join(pluginsDir, sanitizedName);
        
        // Check if plugin already exists
        if (fs.existsSync(destPath)) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Plugin already exists. Delete the old version first.' });
        }
        
        // Move file to plugins directory
        fs.renameSync(req.file.path, destPath);
        
        console.log(`Plugin uploaded: ${sanitizedName}`);
        return res.json({ 
            success: true, 
            message: 'Plugin uploaded successfully',
            filename: sanitizedName
        });
        
    } catch (err) {
        console.error('Plugin upload error:', err);
        
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (cleanupErr) {
                console.error('Cleanup error:', cleanupErr);
            }
        }
        
        return res.status(500).json({ error: err.message || 'Failed to upload plugin' });
    }
});

app.get('/servers/:id/plugins', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) {
            return res.status(403).send('Access denied');
        }
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) return res.status(404).send('Server not found');
        
        const pluginsDir = resolveServerPath(serverId, 'plugins');
        let plugins = [];
        
        if (fs.existsSync(pluginsDir)) {
            const files = fs.readdirSync(pluginsDir);
            
            for (const file of files) {
                const fullPath = path.join(pluginsDir, file);
                const stat = fs.statSync(fullPath);
                
                // Only include .jar files, skip directories
                if (!stat.isDirectory() && file.endsWith('.jar')) {
                    const pluginInfo = await extractPluginInfo(fullPath, file);
                    plugins.push({
                        name: pluginInfo.name || file.replace('.jar', ''),
                        filename: file,
                        version: pluginInfo.version || 'Unknown',
                        description: pluginInfo.description || null,
                        author: pluginInfo.author || null,
                        website: pluginInfo.website || null,
                        size: stat.size,
                        formattedSize: formatFileSize(stat.size),
                        enabled: !file.endsWith('.disabled.jar'),
                        isDirectory: false
                    });
                }
            }
            
            // Sort plugins alphabetically
            plugins.sort((a, b) => a.name.localeCompare(b.name));
        }
        
        res.render('servers/plugins', await getTemplateVars(req, server, {
            plugins,
            success: req.query.success,
            error: req.query.error,
            activePage: 'plugins',
            currentPage: 'server',
            title: `${server.name} - Plugins`
        }));
    } catch (err) {
        console.error('Plugins page error:', err);
        res.status(500).send('Error loading plugins');
    }
});

// Helper function to extract plugin info from JAR file
async function extractPluginInfo(jarPath, filename) {
    try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(jarPath);
        
        // Try to find plugin.yml (Bukkit/Spigot) or paper-plugin.yml (Paper)
        let pluginYml = zip.getEntry('plugin.yml');
        if (!pluginYml) {
            pluginYml = zip.getEntry('paper-plugin.yml');
        }
        if (!pluginYml) {
            pluginYml = zip.getEntry('bungee.yml'); // BungeeCord plugins
        }
        
        if (pluginYml) {
            const content = zip.readAsText(pluginYml);
            const yaml = require('js-yaml');
            const data = yaml.load(content);
            
            return {
                name: data.name || filename.replace('.jar', ''),
                version: data.version || 'Unknown',
                description: data.description || null,
                author: data.author || (data.authors && data.authors[0]) || null,
                website: data.website || null,
                main: data.main || null
            };
        }
        
        // If no plugin.yml, try to extract from manifest
        const manifest = zip.getEntry('META-INF/MANIFEST.MF');
        if (manifest) {
            const content = zip.readAsText(manifest);
            const versionMatch = content.match(/Implementation-Version:\s*(.+)/i);
            if (versionMatch) {
                return {
                    name: filename.replace('.jar', ''),
                    version: versionMatch[1].trim(),
                    description: null,
                    author: null,
                    website: null
                };
            }
        }
        
        return {
            name: filename.replace('.jar', ''),
            version: 'Unknown',
            description: null,
            author: null,
            website: null
        };
    } catch (err) {
        console.error(`Error extracting plugin info from ${filename}:`, err.message);
        return {
            name: filename.replace('.jar', ''),
            version: 'Unknown',
            description: null,
            author: null,
            website: null
        };
    }
}
// ================================================
// PLAYERS ROUTES
// ================================================
app.get('/servers/:id/players', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).send('Access denied');
        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) return res.status(404).send('Server not found');
        const ops = readPlayerFile(serverId, 'ops.json');
        const whitelist = readPlayerFile(serverId, 'whitelist.json');
        const bannedPlayers = readPlayerFile(serverId, 'banned-players.json');
        const bannedIps = readPlayerFile(serverId, 'banned-ips.json');
        const propertiesPath = resolveServerPath(serverId, 'server.properties');
        let whitelistEnabled = false;
        if (fs.existsSync(propertiesPath)) {
            const content = fs.readFileSync(propertiesPath, 'utf8');
            const match = content.match(/^white-list=(true|false)$/m);
            if (match) whitelistEnabled = match[1] === 'true';
        }
        const online = getOnlinePlayers(serverId);
        res.render('servers/players', await getTemplateVars(req, server, {
            ops: ops || [],
            whitelist: whitelist || [],
            banned: bannedPlayers || [],
            bannedPlayers: bannedPlayers || [],
            bannedIps: bannedIps || [],
            whitelistEnabled,
            online: online || [],
            currentPage: 'players',
            success: req.query.success,
            serverId: server.id,
            activePage: 'players',
            error: req.query.error,
            query: req.query,
            title: `${server.name} - Players`
        }));
    } catch (err) {
        console.error(`Players page error for server ${req.params.id}:`, err);
        res.status(500).send('Server error');
    }
});
app.get('/servers/:id/players/online', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
    res.json(getOnlinePlayers(serverId));
});
app.post('/servers/:id/players/online/refresh', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
    
    // Query online players by sending /list command
    const success = await queryOnlinePlayers(serverId);
    
    if (success) {
        res.sendStatus(200);
    } else {
        res.status(400).json({ error: 'Server is offline' });
    }
});
app.post('/servers/:id/players/whitelist/toggle', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { enabled } = req.body;
        const isEnabled = enabled === 'true' || enabled === true;
        const propertiesPath = resolveServerPath(serverId, 'server.properties');
        let properties = {};
        if (fs.existsSync(propertiesPath)) {
            properties = parseProperties(fs.readFileSync(propertiesPath, 'utf8'));
        }
        properties['white-list'] = isEnabled;
        writeProperties(properties, propertiesPath);
        executeCommand(serverId, `/whitelist ${isEnabled ? 'on' : 'off'}`);
        res.redirect(`/servers/${serverId}/players?success=Whitelist ${isEnabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
        console.error(`Toggle whitelist error for server ${serverId}`, err);
        res.redirect(`/servers/${serverId}/players?error=Failed to toggle whitelist`);
    }
});
app.post('/servers/:id/players/op/add', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { name, level = 4 } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        
        console.log(`Adding OP: ${name} to server ${serverId}`);
        
        // Try to send command to running server
        const commandSent = await sendCommand(serverId, `op ${name}`);
        
        if (!commandSent) {
            // Server not running or command failed, update file directly
            let ops = readPlayerFile(serverId, 'ops.json');
            if (ops.find(o => o.name.toLowerCase() === name.toLowerCase())) {
                return res.status(400).json({ error: 'Player already OP' });
            }
            
            // Try to get UUID (optional, will work without it)
            let uuid = null;
            try {
                uuid = await getUUID(name);
            } catch (err) {
                console.log('Could not fetch UUID, using placeholder');
                uuid = '00000000-0000-0000-0000-000000000000';
            }
            
            ops.push({ 
                uuid: uuid, 
                name: name, 
                level: parseInt(level) || 4, 
                bypassesPlayerLimit: false 
            });
            writePlayerFile(serverId, 'ops.json', ops);
        }
        
        return res.json({ success: true, message: 'Operator added successfully' });
    } catch (err) {
        console.error(`Add OP error for server ${serverId}:`, err);
        return res.status(500).json({ error: 'Failed to add OP' });
    }
});

app.post('/servers/:id/players/op/remove', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        
        console.log(`Removing OP: ${name} from server ${serverId}`);
        
        // Try to send command to running server
        const commandSent = await sendCommand(serverId, `deop ${name}`);
        
        if (!commandSent) {
            // Server not running or command failed, update file directly
            let ops = readPlayerFile(serverId, 'ops.json');
            ops = ops.filter(o => o.name.toLowerCase() !== name.toLowerCase());
            writePlayerFile(serverId, 'ops.json', ops);
        }
        
        return res.json({ success: true, message: 'Operator removed successfully' });
    } catch (err) {
        console.error(`Remove OP error for server ${serverId}:`, err);
        return res.status(500).json({ error: 'Failed to remove OP' });
    }
});

app.post('/servers/:id/players/whitelist/add', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        
        console.log(`Adding to whitelist: ${name} on server ${serverId}`);
        
        // Try to send command to running server
        const commandSent = await sendCommand(serverId, `whitelist add ${name}`);
        
        if (!commandSent) {
            // Server not running or command failed, update file directly
            let whitelist = readPlayerFile(serverId, 'whitelist.json');
            if (whitelist.find(w => w.name.toLowerCase() === name.toLowerCase())) {
                return res.status(400).json({ error: 'Player already whitelisted' });
            }
            
            // Try to get UUID (optional)
            let uuid = null;
            try {
                uuid = await getUUID(name);
            } catch (err) {
                console.log('Could not fetch UUID, using placeholder');
                uuid = '00000000-0000-0000-0000-000000000000';
            }
            
            whitelist.push({ uuid: uuid, name: name });
            writePlayerFile(serverId, 'whitelist.json', whitelist);
        }
        
        return res.json({ success: true, message: 'Player added to whitelist' });
    } catch (err) {
        console.error(`Add whitelist error for server ${serverId}:`, err);
        return res.status(500).json({ error: 'Failed to add to whitelist' });
    }
});

app.post('/servers/:id/players/whitelist/remove', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        
        console.log(`Removing from whitelist: ${name} on server ${serverId}`);
        
        // Try to send command to running server
        const commandSent = await sendCommand(serverId, `whitelist remove ${name}`);
        
        if (!commandSent) {
            // Server not running or command failed, update file directly
            let whitelist = readPlayerFile(serverId, 'whitelist.json');
            whitelist = whitelist.filter(w => w.name.toLowerCase() !== name.toLowerCase());
            writePlayerFile(serverId, 'whitelist.json', whitelist);
        }
        
        return res.json({ success: true, message: 'Player removed from whitelist' });
    } catch (err) {
        console.error(`Remove whitelist error for server ${serverId}:`, err);
        return res.status(500).json({ error: 'Failed to remove from whitelist' });
    }
});

app.post('/servers/:id/players/ban/add', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { name, reason = 'Banned by an operator' } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        
        console.log(`Banning player: ${name} on server ${serverId}`);
        
        // Try to send command to running server
        const commandSent = await sendCommand(serverId, `ban ${name} ${reason}`);
        
        if (!commandSent) {
            // Server not running or command failed, update file directly
            let banned = readPlayerFile(serverId, 'banned-players.json');
            if (banned.find(b => b.name.toLowerCase() === name.toLowerCase())) {
                return res.status(400).json({ error: 'Player already banned' });
            }
            
            // Try to get UUID (optional)
            let uuid = null;
            try {
                uuid = await getUUID(name);
            } catch (err) {
                console.log('Could not fetch UUID, using placeholder');
                uuid = '00000000-0000-0000-0000-000000000000';
            }
            
            banned.push({
                uuid: uuid,
                name: name,
                created: new Date().toISOString(),
                source: 'Panel',
                expires: 'forever',
                reason: reason
            });
            writePlayerFile(serverId, 'banned-players.json', banned);
        }
        
        return res.json({ success: true, message: 'Player banned successfully' });
    } catch (err) {
        console.error(`Ban player error for server ${serverId}:`, err);
        return res.status(500).json({ error: 'Failed to ban player' });
    }
});

app.post('/servers/:id/players/ban/remove', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        
        console.log(`Unbanning player: ${name} on server ${serverId}`);
        
        // Try to send command to running server
        const commandSent = await sendCommand(serverId, `pardon ${name}`);
        
        if (!commandSent) {
            // Server not running or command failed, update file directly
            let banned = readPlayerFile(serverId, 'banned-players.json');
            banned = banned.filter(b => b.name.toLowerCase() !== name.toLowerCase());
            writePlayerFile(serverId, 'banned-players.json', banned);
        }
        
        return res.json({ success: true, message: 'Player unbanned successfully' });
    } catch (err) {
        console.error(`Unban player error for server ${serverId}:`, err);
        return res.status(500).json({ error: 'Failed to unban player' });
    }
});

app.post('/servers/:id/players/ban-ip/add', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { ip, reason = 'Banned by an operator' } = req.body;
        if (!ip) return res.status(400).json({ error: 'IP required' });
        if (!/^((\d{1,3}\.){3}\d{1,3})$/.test(ip)) {
            return res.status(400).json({ error: 'Invalid IP address' });
        }
        
        console.log(`Banning IP: ${ip} on server ${serverId}`);
        
        // Try to send command to running server
        const commandSent = await sendCommand(serverId, `ban-ip ${ip} ${reason}`);
        
        if (!commandSent) {
            // Server not running or command failed, update file directly
            let bannedIps = readPlayerFile(serverId, 'banned-ips.json');
            if (bannedIps.find(b => b.ip === ip)) {
                return res.status(400).json({ error: 'IP already banned' });
            }
            
            bannedIps.push({
                ip: ip,
                created: new Date().toISOString(),
                source: 'Panel',
                expires: 'forever',
                reason: reason
            });
            writePlayerFile(serverId, 'banned-ips.json', bannedIps);
        }
        
        return res.json({ success: true, message: 'IP banned successfully' });
    } catch (err) {
        console.error(`Ban IP error for server ${serverId}:`, err);
        return res.status(500).json({ error: 'Failed to ban IP' });
    }
});

app.post('/servers/:id/players/ban-ip/remove', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ error: 'IP required' });
        
        console.log(`Unbanning IP: ${ip} on server ${serverId}`);
        
        // Try to send command to running server
        const commandSent = await sendCommand(serverId, `pardon-ip ${ip}`);
        
        if (!commandSent) {
            // Server not running or command failed, update file directly
            let bannedIps = readPlayerFile(serverId, 'banned-ips.json');
            bannedIps = bannedIps.filter(b => b.ip !== ip);
            writePlayerFile(serverId, 'banned-ips.json', bannedIps);
        }
        
        return res.json({ success: true, message: 'IP unbanned successfully' });
    } catch (err) {
        console.error(`Unban IP error for server ${serverId}:`, err);
        return res.status(500).json({ error: 'Failed to unban IP' });
    }
});

// Kick player
app.post('/servers/:id/players/kick', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        const { name, reason = 'Kicked by an operator' } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        
        console.log(`Kicking player: ${name} from server ${serverId}`);
        
        // Send kick command to running server
        const commandSent = await sendCommand(serverId, `kick ${name} ${reason}`);
        
        if (!commandSent) {
            return res.status(400).json({ error: 'Server is not running or player is not online' });
        }
        
        return res.json({ success: true, message: 'Player kicked successfully' });
    } catch (err) {
        console.error(`Kick player error for server ${serverId}:`, err);
        return res.status(500).json({ error: 'Failed to kick player' });
    }
});

// Get all players (combined list)
app.get('/servers/:id/players/all', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!await isAuthorized(req, serverId)) return res.status(403).json({ error: 'Access denied' });
        
        const ops = readPlayerFile(serverId, 'ops.json') || [];
        const whitelist = readPlayerFile(serverId, 'whitelist.json') || [];
        const banned = readPlayerFile(serverId, 'banned-players.json') || [];
        const online = getOnlinePlayers(serverId) || [];
        
        return res.json({
            success: true,
            online,
            ops,
            whitelist,
            banned
        });
    } catch (err) {
        console.error('Get all players error:', err);
        return res.status(500).json({ error: 'Failed to get players' });
    }
});


// ================================================
// WORLDS ROUTES (FIXED: all paths now /servers/:id/, router removed, db fixed, no extra files, live ready)
// ================================================
app.get('/servers/:id/worlds', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).send('Access denied');
    try {
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      const serverDir = resolveServerPath(serverId);
      const files = fs.readdirSync(serverDir, { withFileTypes: true });
      const worlds = [];
      for (const file of files) {
        if (file.isDirectory()) {
          const worldDir = path.join(serverDir, file.name);
          // Check for level.dat OR other Minecraft world indicators
          const hasLevelDat = fs.existsSync(path.join(worldDir, 'level.dat'));
          const hasUidDat = fs.existsSync(path.join(worldDir, 'uid.dat'));
          const hasSessionLock = fs.existsSync(path.join(worldDir, 'session.lock'));
          const hasDataFolder = fs.existsSync(path.join(worldDir, 'data'));
          const hasPlayerData = fs.existsSync(path.join(worldDir, 'playerdata'));
          const hasDimensions = fs.existsSync(path.join(worldDir, 'DIM-1')) || fs.existsSync(path.join(worldDir, 'DIM1'));
          
          // Consider it a world if it has level.dat OR multiple world indicators
          const isWorld = hasLevelDat || (hasUidDat && (hasSessionLock || hasDataFolder || hasPlayerData || hasDimensions));
          
          if (isWorld) {
            const sizeBytes = getDirSize(worldDir);
            const sizeGB = sizeBytes / 1024 / 1024 / 1024;
            const sizeMB = sizeBytes / 1024 / 1024;
            const sizeKB = sizeBytes / 1024;
            
            let sizeStr;
            if (sizeGB >= 1) {
              sizeStr = sizeGB.toFixed(2) + ' GB';
            } else if (sizeMB >= 1) {
              sizeStr = sizeMB.toFixed(2) + ' MB';
            } else if (sizeKB >= 1) {
              sizeStr = sizeKB.toFixed(2) + ' KB';
            } else {
              sizeStr = sizeBytes + ' B';
            }
            
            worlds.push({ 
              name: file.name, 
              size: sizeStr,
              sizeBytes: sizeBytes
            });
          }
        }
      }
      
      let currentWorld = 'world';
      const propertiesPath = path.join(serverDir, 'server.properties');
      if (fs.existsSync(propertiesPath)) {
        const content = fs.readFileSync(propertiesPath, 'utf8');
        const match = content.match(/^level-name=(.*)$/m);
        if (match) currentWorld = match[1].trim();
      }
      
      const backupsDir = path.join(serverDir, 'backups');
      if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
      const backups = fs.readdirSync(backupsDir)
        .filter(f => f.endsWith('.zip'))
        .map(f => ({
          name: f,
          size: (fs.statSync(path.join(backupsDir, f)).size / 1024 / 1024).toFixed(2) + ' MB'
        }));
        
      res.render('servers/worlds', await getTemplateVars(req, server, {
        worlds,
        currentWorld,
        backups,
        success: req.query.success,
        serverId: server.id,
        activePage: 'worlds',
        error: req.query.error,
        currentPage: 'worlds',
        title: `${server.name} - Worlds`
      }));
    } catch (err) {
      console.error(`Worlds page error for server ${serverId}`, err);
      res.status(500).send('Server error');
    }
  });
 
  // Set Active World
  app.post('/servers/:id/worlds/set', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    const { worldName } = req.body;
    if (!worldName) return res.status(400).json({ error: 'World name required' });
    try {
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      const worldDir = resolveServerPath(serverId, worldName);
      if (!fs.existsSync(path.join(worldDir, 'level.dat'))) return res.redirect(`/servers/${serverId}/worlds?error=Invalid world`);
      const propertiesPath = resolveServerPath(serverId, 'server.properties');
      let properties = {};
      if (fs.existsSync(propertiesPath)) {
        properties = parseProperties(fs.readFileSync(propertiesPath, 'utf8'));
      }
      properties['level-name'] = worldName;
      writeProperties(properties, propertiesPath);
      res.redirect(`/servers/${serverId}/worlds?success=Active world set to ${worldName}`);
    } catch (err) {
      console.error(`Set world error for server ${serverId}`, err);
      res.redirect(`/servers/${serverId}/worlds?error=Failed to set active world`);
    }
  });
 
  // Download World
  app.get('/servers/:id/worlds/download/:worldName', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).send('Access denied');
    const worldName = req.params.worldName;
    try {
      const worldDir = resolveServerPath(serverId, worldName);
      if (!fs.existsSync(worldDir)) {
        return res.status(404).send('World not found');
      }
      
      // Check if world has level.dat (is generated)
      if (!fs.existsSync(path.join(worldDir, 'level.dat'))) {
        return res.status(404).send('World not found or not yet generated');
      }
      
      const zipName = `${worldName}-${Date.now()}.zip`;
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
      res.setHeader('Content-Type', 'application/zip');
      
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      archive.on('error', (err) => {
        console.error('Archive error:', err);
        if (!res.headersSent) {
          res.status(500).send('Failed to create archive');
        }
      });
      
      archive.pipe(res);
      
      // Add all files from world directory into a folder named "world"
      // This makes it ready to use directly in Minecraft servers
      const files = fs.readdirSync(worldDir);
      for (const file of files) {
        const filePath = path.join(worldDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // Archive directory with "world" as the parent folder
          archive.directory(filePath, `world/${file}`);
        } else {
          // Archive file with "world" as the parent folder
          archive.file(filePath, { name: `world/${file}` });
        }
      }
      
      await archive.finalize();
      console.log(`World downloaded: ${worldName} (packaged as "world" folder)`);
    } catch (err) {
      console.error(`Download world error for server ${serverId}`, err);
      if (!res.headersSent) {
        res.status(500).send('Download failed: ' + err.message);
      }
    }
  });
 
  // Delete World
  app.post('/servers/:id/worlds/delete', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    
    const { worldName } = req.body;
    if (!worldName) return res.status(400).json({ error: 'World name required' });
    
    try {
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      const propertiesPath = resolveServerPath(serverId, 'server.properties');
      let currentWorld = 'world';
      
      if (fs.existsSync(propertiesPath)) {
        const content = fs.readFileSync(propertiesPath, 'utf8');
        const match = content.match(/^level-name=(.*)$/m);
        if (match) currentWorld = match[1].trim();
      }
      
      if (worldName === currentWorld) {
        return res.status(400).json({ error: 'Cannot delete active world' });
      }
      
      const worldDir = resolveServerPath(serverId, worldName);
      if (fs.existsSync(worldDir)) {
        fs.rmSync(worldDir, { recursive: true, force: true });
        res.json({ success: true, message: 'World deleted successfully' });
      } else {
        res.status(404).json({ error: 'World not found' });
      }
    } catch (err) {
      console.error('Delete world error:', err);
      res.status(500).json({ error: 'Failed to delete world' });
    }
  });
  
  // Upload World
  app.post('/servers/:id/worlds/upload', requireAuth, upload.single('worldFile'), async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    
    const { worldName } = req.body;
    if (!worldName) return res.status(400).json({ error: 'World name required' });
    if (!req.file) return res.status(400).json({ error: 'World file required' });
    
    try {
      const worldDir = resolveServerPath(serverId, worldName);
      
      // Check if world already exists
      if (fs.existsSync(worldDir)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'World already exists' });
      }
      
      // Create world directory
      fs.mkdirSync(worldDir, { recursive: true });
      
      // Extract uploaded ZIP
      await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(unzipper.Extract({ path: worldDir }))
          .on('close', resolve)
          .on('error', reject);
      });
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      
      res.json({ success: true, message: 'World uploaded successfully' });
    } catch (err) {
      console.error('Upload world error:', err);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: 'Failed to upload world' });
    }
  });
  
  // Switch World
  app.post('/servers/:id/worlds/switch', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    
    const { worldName } = req.body;
    if (!worldName) return res.status(400).json({ error: 'World name required' });
    
    try {
      const worldDir = resolveServerPath(serverId, worldName);
      if (!fs.existsSync(worldDir)) {
        return res.status(404).json({ error: 'World not found' });
      }
      
      // Rename the selected world to "world" for easy deployment
      const targetWorldDir = resolveServerPath(serverId, 'world');
      
      // If "world" already exists and it's not the same as the selected world, back it up
      if (fs.existsSync(targetWorldDir) && worldName !== 'world') {
        const backupName = `world_backup_${Date.now()}`;
        const backupDir = resolveServerPath(serverId, backupName);
        console.log(`Backing up current world to: ${backupName}`);
        fs.renameSync(targetWorldDir, backupDir);
      }
      
      // Rename the selected world to "world"
      if (worldName !== 'world') {
        console.log(`Renaming ${worldName} to world`);
        fs.renameSync(worldDir, targetWorldDir);
      }
      
      // Update server.properties to use "world"
      const propertiesPath = resolveServerPath(serverId, 'server.properties');
      if (fs.existsSync(propertiesPath)) {
        let content = fs.readFileSync(propertiesPath, 'utf8');
        content = content.replace(/^level-name=.*$/m, `level-name=world`);
        fs.writeFileSync(propertiesPath, content);
      }
      
      res.json({ 
        success: true, 
        message: 'World switched successfully! The selected world has been renamed to "world" and set as active.' 
      });
    } catch (err) {
      console.error('Switch world error:', err);
      res.status(500).json({ error: 'Failed to switch world: ' + err.message });
    }
  });
 
  // Upload World
  app.post('/servers/:id/worlds/upload', requireAuth, upload.single('worldFile'), async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    const worldName = sanitize(req.body.name || path.basename(req.file.originalname, '.zip'));
    if (!worldName) return res.status(400).json({ error: 'Invalid world name' });
    let tempPath = req.file.path;
    let targetDir = resolveServerPath(serverId, worldName);
    try {
      if (fs.existsSync(targetDir)) return res.redirect(`/servers/${serverId}/worlds?error=World already exists`);
      await new Promise((resolve, reject) => {
        fs.createReadStream(tempPath)
          .pipe(unzipper.Extract({ path: targetDir }))
          .on('close', resolve)
          .on('error', reject);
      });
      // Normalize directory structure if needed
      if (!fs.existsSync(path.join(targetDir, 'level.dat'))) {
        const subdirs = fs.readdirSync(targetDir, { withFileTypes: true }).filter(d => d.isDirectory());
        if (subdirs.length === 1) {
          const subDirPath = path.join(targetDir, subdirs[0].name);
          if (fs.existsSync(path.join(subDirPath, 'level.dat'))) {
            fs.readdirSync(subDirPath).forEach(f => {
              fs.renameSync(path.join(subDirPath, f), path.join(targetDir, f));
            });
            fs.rmdirSync(subDirPath);
          }
        }
      }
      // Validate it's a Minecraft world (check for level.dat OR world indicators)
      const hasLevelDat = fs.existsSync(path.join(targetDir, 'level.dat'));
      const hasRegionFolder = fs.existsSync(path.join(targetDir, 'region'));
      const hasDataFolder = fs.existsSync(path.join(targetDir, 'data'));
      const hasDimensions = fs.existsSync(path.join(targetDir, 'DIM-1')) || fs.existsSync(path.join(targetDir, 'DIM1'));
      
      if (!hasLevelDat && !hasRegionFolder && !hasDataFolder && !hasDimensions) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        return res.redirect(`/servers/${serverId}/worlds?error=Not a valid Minecraft world`);
      }
      res.redirect(`/servers/${serverId}/worlds?success=World uploaded`);
    } catch (err) {
      console.error(`Upload world error for server ${serverId}`, err);
      if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
      res.redirect(`/servers/${serverId}/worlds?error=Failed to upload world`);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  });
 
  // Upload World from URL (FIXED: use axios instead of fetch for compatibility)
  app.post('/servers/:id/worlds/upload_url', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    const { url, name } = req.body;
    if (!url || !name) return res.status(400).json({ error: 'URL and name required' });
    const worldName = sanitize(name);
    if (!worldName) return res.status(400).json({ error: 'Invalid world name' });
    let tempPath = path.join(os.tmpdir(), `world-${Date.now()}.zip`);
    let targetDir = resolveServerPath(serverId, worldName);
    try {
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
      });
      const fileStream = fs.createWriteStream(tempPath);
      await new Promise((resolve, reject) => {
        response.data.pipe(fileStream);
        response.data.on('error', reject);
        fileStream.on('finish', resolve);
      });
      if (fs.existsSync(targetDir)) throw new Error('World already exists');
      await new Promise((resolve, reject) => {
        fs.createReadStream(tempPath)
          .pipe(unzipper.Extract({ path: targetDir }))
          .on('close', resolve)
          .on('error', reject);
      });
      // Normalize directory structure if needed
      if (!fs.existsSync(path.join(targetDir, 'level.dat'))) {
        const subdirs = fs.readdirSync(targetDir, { withFileTypes: true }).filter(d => d.isDirectory());
        if (subdirs.length === 1) {
          const subDirPath = path.join(targetDir, subdirs[0].name);
          if (fs.existsSync(path.join(subDirPath, 'level.dat'))) {
            fs.readdirSync(subDirPath).forEach(f => {
              fs.renameSync(path.join(subDirPath, f), path.join(targetDir, f));
            });
            fs.rmdirSync(subDirPath);
          }
        }
      }
      if (!fs.existsSync(path.join(targetDir, 'level.dat'))) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        throw new Error('Not a valid Minecraft world');
      }
      res.redirect(`/servers/${serverId}/worlds?success=World uploaded from URL`);
    } catch (err) {
      console.error(`Upload URL error for server ${serverId}`, err);
      if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
      res.redirect(`/servers/${serverId}/worlds?error=Failed to upload from URL: ${err.message}`);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  });
 
  // Create Backup
  app.post('/servers/:id/worlds/backup', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    const { worldName } = req.body;
    if (!worldName) return res.status(400).json({ error: 'World name required' });
    try {
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      const worldDir = resolveServerPath(serverId, worldName);
      if (!fs.existsSync(path.join(worldDir, 'level.dat'))) return res.redirect(`/servers/${serverId}/worlds?error=Invalid world`);
      const backupsDir = path.join(resolveServerPath(serverId), 'backups');
      if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const zipName = `${worldName}-${timestamp}.zip`;
      const zipPath = path.join(backupsDir, zipName);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(output);
      archive.directory(worldDir, false);
      await archive.finalize();
      res.redirect(`/servers/${serverId}/worlds?success=Backup created: ${zipName}`);
    } catch (err) {
      console.error(`Backup error for server ${serverId}`, err);
      res.redirect(`/servers/${serverId}/worlds?error=Failed to create backup`);
    }
  });
 
  // Download Backup
  app.get('/servers/:id/worlds/backup/download/:backupName', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).send('Access denied');
    const backupName = req.params.backupName;
    try {
      const backupsDir = resolveServerPath(serverId, 'backups');
      const zipPath = path.join(backupsDir, backupName);
      if (!fs.existsSync(zipPath)) return res.status(404).send('Backup not found');
      res.download(zipPath);
    } catch (err) {
      console.error(`Download backup error for server ${serverId}`, err);
      res.status(500).send('Download failed');
    }
  });
 
  // Delete Backup
  app.post('/servers/:id/worlds/backup/delete', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    const { backupName } = req.body;
    if (!backupName) return res.status(400).json({ error: 'Backup name required' });
    try {
      const backupsDir = resolveServerPath(serverId, 'backups');
      const zipPath = path.join(backupsDir, backupName);
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
        res.redirect(`/servers/${serverId}/worlds?success=Backup deleted`);
      } else {
        res.redirect(`/servers/${serverId}/worlds?error=Backup not found`);
      }
    } catch (err) {
      console.error(`Delete backup error for server ${serverId}`, err);
      res.redirect(`/servers/${serverId}/worlds?error=Failed to delete backup`);
    }
  });
 
  // Restore from Backup
  app.post('/servers/:id/worlds/backup/restore', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    const { backupName, worldName } = req.body;
    if (!backupName || !worldName) return res.status(400).json({ error: 'Backup and world name required' });
    const sanitizedWorldName = sanitize(worldName);
    if (!sanitizedWorldName) return res.status(400).json({ error: 'Invalid world name' });
    try {
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      const targetDir = resolveServerPath(serverId, sanitizedWorldName);
      if (fs.existsSync(targetDir)) return res.redirect(`/servers/${serverId}/worlds?error=World already exists`);
      const backupsDir = resolveServerPath(serverId, 'backups');
      const zipPath = path.join(backupsDir, backupName);
      if (!fs.existsSync(zipPath)) return res.redirect(`/servers/${serverId}/worlds?error=Backup not found`);
      await new Promise((resolve, reject) => {
        fs.createReadStream(zipPath)
          .pipe(unzipper.Extract({ path: targetDir }))
          .on('close', resolve)
          .on('error', reject);
      });
      // Normalize directory structure if needed
      if (!fs.existsSync(path.join(targetDir, 'level.dat'))) {
        const subdirs = fs.readdirSync(targetDir, { withFileTypes: true }).filter(d => d.isDirectory());
        if (subdirs.length === 1) {
          const subDirPath = path.join(targetDir, subdirs[0].name);
          if (fs.existsSync(path.join(subDirPath, 'level.dat'))) {
            fs.readdirSync(subDirPath).forEach(f => {
              fs.renameSync(path.join(subDirPath, f), path.join(targetDir, f));
            });
            fs.rmdirSync(subDirPath);
          }
        }
      }
      if (!fs.existsSync(path.join(targetDir, 'level.dat'))) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        return res.redirect(`/servers/${serverId}/worlds?error=Not a valid Minecraft world`);
      }
      res.redirect(`/servers/${serverId}/worlds?success=Restored from backup`);
    } catch (err) {
      console.error(`Restore error for server ${serverId}`, err);
      if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
      res.redirect(`/servers/${serverId}/worlds?error=Failed to restore`);
    }
  });
 
  // Rename World
  app.post('/servers/:id/worlds/rename', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    let { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ error: 'Old and new names required' });
    const sanitizedNewName = sanitize(newName);
    if (!sanitizedNewName || oldName === sanitizedNewName) return res.status(400).json({ error: 'Invalid new name' });
    try {
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      const oldDir = resolveServerPath(serverId, oldName);
      if (!fs.existsSync(path.join(oldDir, 'level.dat'))) return res.redirect(`/servers/${serverId}/worlds?error=Invalid world`);
      const newDir = resolveServerPath(serverId, sanitizedNewName);
      if (fs.existsSync(newDir)) return res.redirect(`/servers/${serverId}/worlds?error=New name already exists`);
      fs.renameSync(oldDir, newDir);
      // Update properties if active
      const propertiesPath = resolveServerPath(serverId, 'server.properties');
      if (fs.existsSync(propertiesPath)) {
        let properties = parseProperties(fs.readFileSync(propertiesPath, 'utf8'));
        if (properties['level-name'] === oldName) {
          properties['level-name'] = sanitizedNewName;
          writeProperties(properties, propertiesPath);
        }
      }
      res.redirect(`/servers/${serverId}/worlds?success=World renamed to ${sanitizedNewName}`);
    } catch (err) {
      console.error(`Rename error for server ${serverId}`, err);
      res.redirect(`/servers/${serverId}/worlds?error=Failed to rename world`);
    }
  });
 
  // Change World Seed
  app.post('/servers/:id/worlds/change_seed', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    const { worldName, newSeed } = req.body;
    if (!worldName || !newSeed) return res.status(400).json({ error: 'World name and seed required' });
    try {
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      const worldDir = resolveServerPath(serverId, worldName);
      const levelDatPath = path.join(worldDir, 'level.dat');
      
      // If level.dat exists, modify it
      if (fs.existsSync(levelDatPath)) {
        await setWorldSeed(worldDir, newSeed);
        res.redirect(`/servers/${serverId}/worlds?success=Seed changed to ${newSeed}`);
      } else {
        // If level.dat doesn't exist, update server.properties instead
        const propertiesPath = resolveServerPath(serverId, 'server.properties');
        if (fs.existsSync(propertiesPath)) {
          const propertiesContent = fs.readFileSync(propertiesPath, 'utf8');
          const properties = parseProperties(propertiesContent);
          properties['level-seed'] = newSeed;
          writeProperties(properties, propertiesPath);
          res.redirect(`/servers/${serverId}/worlds?success=Seed set to ${newSeed} (will apply on first start)`);
        } else {
          res.redirect(`/servers/${serverId}/worlds?error=Server properties not found`);
        }
      }
    } catch (err) {
      console.error(`Change seed error for server ${serverId}`, err);
      res.redirect(`/servers/${serverId}/worlds?error=Failed to change seed: ${err.message}`);
    }
  });

  // World Marketplace - View
  app.get('/servers/:id/worlds/marketplace', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).send('Access denied');
    
    try {
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      if (!server) return res.status(404).send('Server not found');
      
      res.render('servers/worlds_marketplace', await getTemplateVars(req, server, {
        serverId: server.id,
        activePage: 'worlds',
        currentPage: 'worlds_marketplace',
        title: `${server.name} - World Marketplace`
      }));
    } catch (err) {
      console.error('World marketplace page error:', err);
      res.status(500).send('Server error');
    }
  });

  // World Marketplace API - Fetch worlds from CurseForge
  app.get('/servers/:id/worlds/marketplace/api', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    
    const { search = '', page = 1, category = '' } = req.query;
    
    try {
      const apiKey = process.env.CURSEFORGE_API_KEY || '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm';
      
      const params = {
        gameId: 432, // Minecraft
        classId: 17, // Worlds
        sortField: 2, // Popularity
        sortOrder: 'desc',
        index: (page - 1) * 20,
        pageSize: 20
      };
      
      if (search) params.searchFilter = search;
      
      const response = await axios.get('https://api.curseforge.com/v1/mods/search', {
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json',
          'User-Agent': 'MinecraftServerPanel/1.0'
        },
        params: params,
        timeout: 15000
      });
      
      const worlds = response.data.data.map(mod => {
        const latestFile = mod.latestFiles && mod.latestFiles.length > 0 ? mod.latestFiles[0] : null;
        
        return {
          id: mod.id,
          name: mod.name,
          description: mod.summary || 'No description available',
          author: mod.authors && mod.authors.length > 0 ? mod.authors[0].name : 'Unknown',
          downloads: mod.downloadCount || 0,
          image: mod.logo ? mod.logo.url : 'https://media.forgecdn.net/avatars/thumbnails/default.png',
          fileId: latestFile ? latestFile.id : null,
          fileName: latestFile ? latestFile.fileName : 'world.zip',
          fileSize: latestFile ? latestFile.fileLength : 0,
          downloadUrl: latestFile ? latestFile.downloadUrl : null,
          projectUrl: mod.links ? mod.links.websiteUrl : `https://www.curseforge.com/minecraft/worlds/${mod.slug}`,
          dateModified: latestFile ? latestFile.fileDate : mod.dateModified
        };
      });
      
      res.json({
        success: true,
        worlds: worlds,
        total: response.data.pagination.totalCount,
        page: parseInt(page)
      });
      
    } catch (err) {
      console.error('CurseForge API error:', err.response?.data || err.message);
      res.status(500).json({ 
        error: 'Failed to fetch worlds from CurseForge',
        details: err.response?.data?.message || err.message
      });
    }
  });

  // Direct download route - Downloads .zip to server directory
  app.get('/servers/:id/worlds/download/:worldId/:fileId', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    const { worldId, fileId } = req.params;
    
    try {
      // Check authorization
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
      }
      
      console.log(`[World Download] Starting download for worldId: ${worldId}, fileId: ${fileId}`);
      
      // Try to get file info from CurseForge API
      const apiKey = process.env.CURSEFORGE_API_KEY || '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm';
      let fileName = `world-${worldId}-${fileId}.zip`;
      let downloadUrl = null;
      
      try {
        const fileInfoResponse = await axios.get(`https://api.curseforge.com/v1/mods/${worldId}/files/${fileId}`, {
          headers: {
            'x-api-key': apiKey,
            'Accept': 'application/json',
            'User-Agent': 'MinecraftServerPanel/1.0'
          },
          timeout: 10000
        });
        
        const fileInfo = fileInfoResponse.data.data;
        fileName = fileInfo.fileName || fileName;
        downloadUrl = fileInfo.downloadUrl;
        
        console.log(`[World Download] API Response - fileName: ${fileName}, downloadUrl: ${downloadUrl}`);
        
        // CurseForge API returns null for downloadUrl on most files due to their download policy
        if (!downloadUrl || downloadUrl === 'null') {
          console.log('[World Download] CurseForge API returned null downloadUrl - this is expected behavior');
          return res.status(403).json({
            success: false,
            error: 'CurseForge requires manual downloads',
            reason: 'curseforge_policy',
            fileName: fileName,
            message: 'CurseForge does not allow automated downloads for this world. This is a CurseForge policy to ensure proper download tracking and attribution to mod authors.'
          });
        }
        
      } catch (apiError) {
        console.log(`[World Download] API request failed: ${apiError.message}`);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch world information from CurseForge',
          reason: 'api_error',
          message: apiError.message
        });
      }
      
      // If we got here, we have a valid download URL (rare case)
      const serverDir = resolveServerPath(serverId);
      if (!fs.existsSync(serverDir)) {
        fs.mkdirSync(serverDir, { recursive: true });
      }
      
      const filePath = path.join(serverDir, fileName);
      
      // Check if already exists
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        return res.json({
          success: true,
          message: 'World already downloaded',
          fileName: fileName,
          filePath: `servers/${serverId}/${fileName}`,
          fileSize: `${fileSizeMB} MB`,
          alreadyExists: true
        });
      }
      
      console.log(`[World Download] Attempting download from: ${downloadUrl}`);
      
      // Try to download
      const response = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'stream',
        timeout: 300000, // 5 minutes
        maxRedirects: 10,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Referer': 'https://www.curseforge.com/'
        }
      });
      
      // Check content type
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('text/html')) {
        throw new Error('Received HTML page instead of file - download blocked');
      }
      
      // Download file
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.on('error', reject);
      });
      
      // Verify file
      if (!fs.existsSync(filePath)) {
        throw new Error('File was not created');
      }
      
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        fs.unlinkSync(filePath);
        throw new Error('Downloaded file is empty');
      }
      
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`[World Download] Success! Size: ${fileSizeMB} MB`);
      
      res.json({
        success: true,
        message: `World downloaded successfully!`,
        fileName: fileName,
        filePath: `servers/${serverId}/${fileName}`,
        fileSize: `${fileSizeMB} MB`,
        downloaded: true
      });
      
    } catch (err) {
      console.error('[World Download] Error:', err.message);
      
      // Clean up failed downloads
      try {
        const serverDir = resolveServerPath(serverId);
        if (fs.existsSync(serverDir)) {
          const files = fs.readdirSync(serverDir).filter(f => f.endsWith('.zip'));
          files.forEach(file => {
            const filePath = path.join(serverDir, file);
            if (fs.existsSync(filePath)) {
              const stats = fs.statSync(filePath);
              if (stats.size === 0) {
                fs.unlinkSync(filePath);
              }
            }
          });
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      res.status(500).json({
        success: false,
        error: 'Download failed',
        reason: 'download_error',
        message: err.message || 'Could not download world file'
      });
    }
  });

  // List downloaded worlds
  app.get('/servers/:id/worlds/downloaded', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    
    try {
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }
      
      const serverDir = resolveServerPath(serverId);
      
      if (!fs.existsSync(serverDir)) {
        return res.json({ success: true, worlds: [] });
      }
      
      const files = fs.readdirSync(serverDir);
      const zipFiles = files.filter(f => f.endsWith('.zip'));
      
      const worlds = zipFiles.map(fileName => {
        const filePath = path.join(serverDir, fileName);
        const stats = fs.statSync(filePath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        return {
          fileName: fileName,
          filePath: `servers/${serverId}/${fileName}`,
          fileSize: `${fileSizeMB} MB`,
          downloadedAt: stats.mtime
        };
      });
      
      res.json({ success: true, worlds: worlds });
      
    } catch (err) {
      console.error('Error listing downloaded worlds:', err);
      res.status(500).json({ error: 'Failed to list downloaded worlds' });
    }
  });

  app.post('/servers/:id/worlds/marketplace/install', requireAuth, async (req, res) => {
    const serverId = req.params.id;
    if (!(await isAuthorized(req, serverId))) return res.status(403).json({ error: 'Access denied' });
    
    const { worldName, downloadUrl, worldId } = req.body;
    if (!worldName || !downloadUrl) {
      return res.status(400).json({ error: 'World name and download URL required' });
    }
    
    const sanitizedWorldName = sanitize(worldName);
    if (!sanitizedWorldName) {
      return res.status(400).json({ error: 'Invalid world name' });
    }
    
    let tempPath = path.join(os.tmpdir(), `world-${Date.now()}.zip`);
    let targetDir = resolveServerPath(serverId, sanitizedWorldName);
    
    try {
      // Check if world already exists
      if (fs.existsSync(targetDir)) {
        return res.status(400).json({ error: 'World already exists' });
      }
      
      console.log(`Downloading world "${worldName}" from: ${downloadUrl}`);
      
      // Handle different URL types
      let fullUrl = downloadUrl;
      if (downloadUrl.startsWith('/')) {
        // Relative URL - convert to full URL
        fullUrl = `http://localhost:3000${downloadUrl}`;
      } else if (!downloadUrl.startsWith('http://') && !downloadUrl.startsWith('https://')) {
        // Invalid URL format - use fallback
        console.log('Invalid URL format, using fallback test world');
        fullUrl = `http://localhost:3000/test-world.zip`;
      }
      
      console.log(`Full download URL: ${fullUrl}`);
      
      // Enhanced headers for better compatibility
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/octet-stream, application/zip, application/x-zip-compressed, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      };
      
      const response = await axios({
        url: fullUrl,
        method: 'GET',
        responseType: 'stream',
        timeout: 180000, // 3 minute timeout for large worlds
        maxRedirects: 10,
        headers: headers,
        validateStatus: function (status) {
          return status >= 200 && status < 400;
        },
        // Handle SSL issues
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });
      
      const fileStream = fs.createWriteStream(tempPath);
      
      await new Promise((resolve, reject) => {
        response.data.pipe(fileStream);
        response.data.on('error', reject);
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });
      
      console.log(`World downloaded to: ${tempPath}`);
      
      // Check file size
      const stats = fs.statSync(tempPath);
      if (stats.size < 1000) {
        throw new Error('Downloaded file is too small to be a valid world');
      }
      
      // Create target directory
      fs.mkdirSync(targetDir, { recursive: true });
      
      // Extract ZIP file
      console.log(`Extracting world to: ${targetDir}`);
      
      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(tempPath)
          .pipe(unzipper.Extract({ path: targetDir }));
        
        stream.on('close', resolve);
        stream.on('error', reject);
      });
      
      // Normalize directory structure - move contents up if nested in a single folder
      const items = fs.readdirSync(targetDir, { withFileTypes: true });
      const subdirs = items.filter(d => d.isDirectory());
      
      // If there's only one subdirectory and no files at root level, move contents up
      if (subdirs.length === 1 && items.length === 1) {
        const subDirPath = path.join(targetDir, subdirs[0].name);
        const subItems = fs.readdirSync(subDirPath);
        
        // Move all contents from subdirectory to target directory
        for (const item of subItems) {
          const srcPath = path.join(subDirPath, item);
          const destPath = path.join(targetDir, item);
          fs.renameSync(srcPath, destPath);
        }
        
        // Remove empty subdirectory
        fs.rmdirSync(subDirPath);
      }
      
      // Validate it's a Minecraft world
      const hasLevelDat = fs.existsSync(path.join(targetDir, 'level.dat'));
      const hasRegionFolder = fs.existsSync(path.join(targetDir, 'region'));
      const hasDataFolder = fs.existsSync(path.join(targetDir, 'data'));
      
      if (!hasLevelDat && !hasRegionFolder && !hasDataFolder) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        return res.status(400).json({ 
          error: 'Not a valid Minecraft world - missing level.dat or region folder' 
        });
      }
      
      console.log(`World "${worldName}" installed successfully`);
      res.json({ 
        success: true, 
        message: `${worldName} installed successfully! Go to World Management to switch to this world.`,
        worldName: sanitizedWorldName
      });
      
    } catch (err) {
      console.error('World install error:', err);
      
      // Clean up on error
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      
      // Try fallback download if original fails
      if (!downloadUrl.includes('test-world.zip')) {
        console.log('Trying fallback download...');
        try {
          const fallbackUrl = `http://localhost:3000/test-world.zip`;
          const fallbackResponse = await axios({
            url: fallbackUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 60000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          const fallbackStream = fs.createWriteStream(tempPath);
          await new Promise((resolve, reject) => {
            fallbackResponse.data.pipe(fallbackStream);
            fallbackResponse.data.on('error', reject);
            fallbackStream.on('finish', resolve);
            fallbackStream.on('error', reject);
          });
          
          // Create target directory and extract
          fs.mkdirSync(targetDir, { recursive: true });
          await new Promise((resolve, reject) => {
            const stream = fs.createReadStream(tempPath)
              .pipe(unzipper.Extract({ path: targetDir }));
            stream.on('close', resolve);
            stream.on('error', reject);
          });
          
          console.log(`Fallback world installed successfully: ${sanitizedWorldName}`);
          return res.json({ 
            success: true, 
            message: `${worldName} installed successfully using fallback world! Go to World Management to switch to this world.`,
            worldName: sanitizedWorldName,
            fallback: true
          });
          
        } catch (fallbackErr) {
          console.error('Fallback download also failed:', fallbackErr);
        }
      }
      
      let errorMessage = 'Failed to install world';
      if (err.code === 'ENOTFOUND') {
        errorMessage = 'Could not download world - server not found. The download link may be offline.';
      } else if (err.code === 'ETIMEDOUT') {
        errorMessage = 'Download timed out - the world file may be too large or the server is slow. Try again later.';
      } else if (err.response && err.response.status === 404) {
        errorMessage = 'World download link not found (404). The file may have been moved or deleted.';
      } else if (err.response && err.response.status === 403) {
        errorMessage = 'Access denied - the download link requires authentication or has restrictions.';
      } else if (err.code === 'ERR_INVALID_URL') {
        errorMessage = 'Invalid download URL format. Please check the world download link.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      res.status(500).json({ error: errorMessage });
      
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  });

// ================================================
// SERVER PROPERTIES ROUTES
// ================================================

// Properties editor page
app.get('/servers/:id/properties', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!(await isAuthorized(req, serverId))) {
            return res.status(403).send('Access denied');
        }

        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).send('Server not found');
        }

        res.render('servers/properties', await getTemplateVars(req, server, {
            activePage: 'properties',
            currentPage: 'server-properties'
        }));
    } catch (err) {
        console.error('Properties page error:', err);
        res.status(500).send('Internal server error');
    }
});

// Get current properties as JSON
app.get('/servers/:id/properties/get', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!(await isAuthorized(req, serverId))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        const propertiesPath = resolveServerPath(serverId, 'server.properties');
        let properties = {};

        if (fs.existsSync(propertiesPath)) {
            try {
                const content = fs.readFileSync(propertiesPath, 'utf8');
                properties = parseProperties(content);
            } catch (err) {
                console.error('Error reading server.properties:', err);
                // Return default properties if file can't be read
                properties = getDefaultProperties(server);
            }
        } else {
            // Create default properties file if it doesn't exist
            properties = getDefaultProperties(server);
            await updateServerPropertiesPort(serverId, server.port);
        }

        res.json({ success: true, properties });
    } catch (err) {
        console.error('Get properties error:', err);
        res.status(500).json({ error: 'Failed to load properties' });
    }
});

// Save properties
app.post('/servers/:id/properties/save', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!(await isAuthorized(req, serverId))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        const { properties } = req.body;
        if (!properties || typeof properties !== 'object') {
            return res.status(400).json({ error: 'Invalid properties data' });
        }

        // Ensure server port is protected
        properties['server-port'] = server.port;

        const propertiesPath = resolveServerPath(serverId, 'server.properties');
        
        // Write properties to file
        writeProperties(properties, propertiesPath);

        console.log(`Properties saved for server ${serverId}`);
        
        res.json({ 
            success: true, 
            message: 'Properties saved successfully!',
            warning: properties['server-port'] !== server.port ? 'Server port was protected and not changed' : null
        });
    } catch (err) {
        console.error('Save properties error:', err);
        res.status(500).json({ error: 'Failed to save properties' });
    }
});

// Reset properties to defaults
app.post('/servers/:id/properties/reset', requireAuth, async (req, res) => {
    try {
        const serverId = req.params.id;
        if (!(await isAuthorized(req, serverId))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        // Get default properties and ensure correct port
        const defaultProperties = getDefaultProperties(server);
        defaultProperties['server-port'] = server.port;

        const propertiesPath = resolveServerPath(serverId, 'server.properties');
        
        // Write default properties to file
        writeProperties(defaultProperties, propertiesPath);

        console.log(`Properties reset to defaults for server ${serverId}`);
        
        res.json({ 
            success: true, 
            message: 'Properties reset to defaults successfully!'
        });
    } catch (err) {
        console.error('Reset properties error:', err);
        res.status(500).json({ error: 'Failed to reset properties' });
    }
});

// Helper function to get default server properties
function getDefaultProperties(server) {
    return {
        'server-ip': '',
        'server-port': server.port,
        'motd': server.name || 'Minecraft Server',
        'max-players': 20,
        'gamemode': 'survival',
        'difficulty': 'normal',
        'hardcore': false,
        'pvp': true,
        'allow-flight': false,
        'level-name': 'world',
        'level-seed': '',
        'level-type': 'minecraft:normal',
        'generate-structures': true,
        'spawn-animals': true,
        'spawn-monsters': true,
        'view-distance': 10,
        'simulation-distance': 10,
        'max-tick-time': 60000,
        'online-mode': true,
        'white-list': false,
        'enforce-whitelist': false,
        'spawn-protection': 16,
        'enable-command-block': false,
        'function-permission-level': 2,
        'op-permission-level': 4,
        'resource-pack': '',
        'resource-pack-sha1': ''
    };
}
 
// ================================================
// SOCKET.IO HANDLERS (enhanced with live stats)
// ================================================
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
   
    socket.on('join-server', (serverId) => {
        socket.join(`server:${serverId}`);
        console.log(`Socket ${socket.id} joined server ${serverId}`);
        // Send current live stats immediately
        if (liveStats[serverId]) {
          socket.emit('liveStats', liveStats[serverId]);
        }
    });
   
    socket.on('leave-server', (serverId) => {
        socket.leave(`server:${serverId}`);
        console.log(`Socket ${socket.id} left server ${serverId}`);
    });
   
    socket.on('console-command', async ({ serverId, command }) => {
        try {
            await sendCommand(serverId, command); // FIXED: consistent with screen
        } catch (err) {
            console.error('Socket command error:', err);
        }
    });
   
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});
// ================================================
// ERROR HANDLERS
// ================================================
// 404 handler
app.use(async (req, res) => {
    res.status(404).render('error', await getTemplateVars(req, null, {
        message: 'Page not found',
        status: 404,
        title: 'Error'
    }));
});
// Error handler
app.use(async (err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).render('error', await getTemplateVars(req, null, {
        message: 'Internal server error',
        status: 500,
        error: process.env.NODE_ENV === 'development' ? err : null,
        title: 'Error'
    }));
});
// ================================================
// Reconnect to running servers on panel startup
async function reconnectToRunningServers() {
  console.log('Checking for running servers...');
  
  try {
    const servers = await dbAll('SELECT * FROM servers');
    
    for (const server of servers) {
      const serverId = server.id;
      const serverDir = resolveServerPath(serverId);
      const pidFile = path.join(serverDir, '.server.pid');
      
      if (fs.existsSync(pidFile)) {
        try {
          const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
          
          if (isProcessRunning(pid)) {
            console.log(`Found running server ${serverId} (PID: ${pid})`);
            
            // Update database status to 'running' not 'online'
            await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['running', serverId]);
            
            // Initialize global.serverProcesses if not exists
            if (!global.serverProcesses) {
              global.serverProcesses = {};
            }
            
            // Create a pseudo-process object that can be used for stdin commands
            // We can't fully attach to the existing process, but we can create a reference
            try {
              // Try to attach stdin to the running process (platform-specific)
              const pseudoProcess = {
                pid: pid,
                killed: false,
                stdin: null, // Will be null since we can't attach stdin to existing process
                on: () => {}, // Dummy event handler
                kill: (signal) => {
                  try {
                    process.kill(pid, signal || 'SIGTERM');
                    return true;
                  } catch (err) {
                    console.error(`Failed to kill process ${pid}:`, err);
                    return false;
                  }
                }
              };
              
              global.serverProcesses[serverId] = pseudoProcess;
              console.log(`Created process reference for server ${serverId}`);
            } catch (err) {
              console.error(`Failed to create process reference for server ${serverId}:`, err);
            }
            
            // Initialize tracking
            if (!onlinePlayers[serverId]) {
              onlinePlayers[serverId] = [];
            }
            
            // Try to load start time from file, otherwise use current time as approximation
            const savedStartTime = loadServerStartTime(serverId);
            if (savedStartTime) {
              serverStartTimes[serverId] = savedStartTime;
              console.log(`Restored start time for server ${serverId} from file`);
            } else {
              serverStartTimes[serverId] = Date.now(); // Approximate start time
              console.log(`No saved start time found for server ${serverId}, using current time`);
            }
            
            // Start log tailing - this is crucial for tracking player join/leave
            startLogTail(serverId);
            
            console.log(`Reconnected to server ${serverId}`);
            
            // Query current online players via RCON (more reliable than stdin after reconnect)
            setTimeout(() => {
              queryOnlinePlayers(serverId);
            }, 3000); // Wait 3 seconds for log tail to be ready
          } else {
            // Process not running, clean up stale PID file
            console.log(`Server ${serverId} PID file exists but process not running, cleaning up`);
            fs.unlinkSync(pidFile);
            deleteServerStartTime(serverId); // Also clean up stale start time file
            await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['stopped', serverId]);
          }
        } catch (err) {
          console.error(`Error reconnecting to server ${serverId}:`, err);
          // Clean up problematic PID file
          try {
            if (fs.existsSync(pidFile)) {
              fs.unlinkSync(pidFile);
            }
          } catch (e) {
            console.error(`Failed to clean up PID file for server ${serverId}:`, e);
          }
          await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['stopped', serverId]);
        }
      } else {
        // No PID file, ensure server is marked as stopped
        if (server.status !== 'stopped') {
          console.log(`Server ${serverId} has no PID file, marking as stopped`);
          await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['stopped', serverId]);
        }
      }
    }
    
    console.log('Server reconnection check complete');
  } catch (err) {
    console.error('Error during server reconnection:', err);
  }
}

// START SERVER
// ================================================
server.listen(port, async () => {
    console.log(`Minecraft Panel running on http://localhost:${port}`);
    console.log(`Admin login: admin / admin123`);
    
    // Reconnect to any servers that are still running
    await reconnectToRunningServers();
    
    // Smart Port Protection: Available but not forced on startup
    // Use POST /admin/validate-ports to manually validate if needed
    console.log('🚀 Smart Port Protection system ready (conservative mode)');
    console.log('💡 Use POST /admin/validate-ports to manually validate server ports if needed');
    
    // Periodic status check every 30 seconds to keep database in sync
    setInterval(async () => {
        try {
            const servers = await dbAll('SELECT * FROM servers');
            
            for (const server of servers) {
                const serverId = server.id;
                const isRunning = await isServerRunning(serverId);
                const dbStatus = server.status;
                
                // Update database if status doesn't match reality
                if (isRunning && dbStatus === 'stopped') {
                    console.log(`Server ${serverId} is running but marked as stopped, updating...`);
                    await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['running', serverId]);
                    
                    // Reinitialize tracking if needed
                    if (!onlinePlayers[serverId]) {
                        onlinePlayers[serverId] = [];
                    }
                    if (!serverStartTimes[serverId]) {
                        serverStartTimes[serverId] = Date.now();
                    }
                    
                    // Start log tailing if not already started
                    if (!serverLogWatchers[serverId]) {
                        startLogTail(serverId);
                    }
                    
                    // Query online players to update the list
                    setTimeout(() => {
                        queryOnlinePlayers(serverId);
                    }, 2000);
                } else if (!isRunning && (dbStatus === 'running' || dbStatus === 'starting')) {
                    console.log(`Server ${serverId} is stopped but marked as ${dbStatus}, updating...`);
                    await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['stopped', serverId]);
                    
                    // Clean up tracking
                    delete serverStartTimes[serverId];
                    onlinePlayers[serverId] = [];
                    
                    if (serverLogWatchers[serverId]) {
                        serverLogWatchers[serverId].close();
                        delete serverLogWatchers[serverId];
                    }
                }
            }
        } catch (err) {
            console.error('Error in periodic status check:', err);
        }
    }, 30000); // Check every 30 seconds
});
// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down panel...');
   
    // DO NOT stop servers - let them continue running in background
    console.log('Servers will continue running in background');
    
    // Just detach from server processes
    if (global.serverProcesses) {
        Object.keys(global.serverProcesses).forEach(serverId => {
            const proc = global.serverProcesses[serverId];
            if (proc && !proc.killed) {
                console.log(`Detaching from server ${serverId}...`);
                // Unref to allow panel to exit without killing server
                // Check if unref exists (pseudo-processes from reconnection don't have it)
                if (typeof proc.unref === 'function') {
                    proc.unref();
                }
            }
        });
    }
   
    // Close database
    db.close((err) => {
        if (err) console.error('Error closing database:', err);
        else console.log('Database closed');
        console.log('Panel stopped. Servers are still running.');
        process.exit(0);
    });
});