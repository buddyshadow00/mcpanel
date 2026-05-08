// Handle server start/stop actions
document.addEventListener('DOMContentLoaded', function() {
    // Start server
    document.querySelectorAll('.start-server').forEach(button => {
        button.addEventListener('click', function() {
            const serverId = this.getAttribute('data-id');
            startServer(serverId, this);
        });
    });
    
    // Stop server
    document.querySelectorAll('.stop-server').forEach(button => {
        button.addEventListener('click', function() {
            const serverId = this.getAttribute('data-id');
            stopServer(serverId, this);
        });
    });
});

function startServer(serverId, button) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Starting...';
    
    fetch(`/servers/${serverId}/start`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            setTimeout(() => {
                location.reload();
            }, 1000);
        } else {
            alert('Error starting server: ' + data.error);
            button.disabled = false;
            button.innerHTML = 'Start';
        }
    })
    .catch(error => {
        alert('Error starting server: ' + error);
        button.disabled = false;
        button.innerHTML = 'Start';
    });
}

function stopServer(serverId, button) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Stopping...';
    
    fetch(`/servers/${serverId}/stop`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            setTimeout(() => {
                location.reload();
            }, 1000);
        } else {
            alert('Error stopping server: ' + data.error);
            button.disabled = false;
            button.innerHTML = 'Stop';
        }
    })
    .catch(error => {
        alert('Error stopping server: ' + error);
        button.disabled = false;
        button.innerHTML = 'Stop';
    });
}