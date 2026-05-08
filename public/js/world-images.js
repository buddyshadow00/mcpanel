// Generate category-based gradient images for worlds
function generateWorldImage(category, seed) {
    const gradients = {
        skyblock: ['#87CEEB', '#4682B4', '#1E90FF'], // Sky blues
        adventure: ['#8B4513', '#D2691E', '#CD853F'], // Earth tones
        parkour: ['#FF6B6B', '#FF8E53', '#FFA07A'], // Energetic oranges/reds
        creative: ['#9B59B6', '#8E44AD', '#6C3483'], // Royal purples
        pvp: ['#E74C3C', '#C0392B', '#922B21'], // Battle reds
        survival: ['#27AE60', '#229954', '#1E8449'], // Nature greens
        minigame: ['#F39C12', '#E67E22', '#D68910'], // Fun oranges
        modded: ['#3498DB', '#2980B9', '#21618C']  // Tech blues
    };
    
    const icons = {
        skyblock: '☁️',
        adventure: '⚔️',
        parkour: '🏃',
        creative: '🏗️',
        pvp: '⚡',
        survival: '🌲',
        minigame: '🎮',
        modded: '⚙️'
    };
    
    const colors = gradients[category] || gradients.creative;
    const icon = icons[category] || '🌍';
    
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 400, 240);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(0.5, colors[1]);
    gradient.addColorStop(1, colors[2]);
    
    // Fill background
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 400, 240);
    
    // Add pattern overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = 0; i < 20; i++) {
        const x = (seed * 17 + i * 23) % 400;
        const y = (seed * 13 + i * 19) % 240;
        ctx.fillRect(x, y, 40, 40);
    }
    
    // Add icon
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillText(icon, 200, 120);
    
    // Add category label
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(category.toUpperCase(), 200, 200);
    
    return canvas.toDataURL();
}
