(function () {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
        return;
    }

    canvas.width = 64;
    canvas.height = 64;

    const frames = [
        { bob: 1, angle: -0.35, shine: 0.22 },
        { bob: 0, angle: -0.12, shine: 0.38 },
        { bob: -1, angle: 0.14, shine: 0.54 },
        { bob: 0, angle: 0.36, shine: 0.3 },
    ];

    const iconLink = ensureIconLink();
    let frameIndex = 0;

    renderFrame(frames[frameIndex]);
    frameIndex = (frameIndex + 1) % frames.length;

    window.setInterval(() => {
        if (document.hidden) {
            return;
        }

        renderFrame(frames[frameIndex]);
        frameIndex = (frameIndex + 1) % frames.length;
    }, 420);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            renderFrame(frames[frameIndex]);
        }
    });

    function ensureIconLink() {
        let link = document.querySelector('link[rel="icon"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            link.type = 'image/png';
            document.head.appendChild(link);
        }
        return link;
    }

    function renderFrame(frame) {
        context.clearRect(0, 0, canvas.width, canvas.height);

        drawRoundedRect(8, 8, 48, 48, 14, '#ffffff', '#111111', 3);

        const bagY = 22 + frame.bob;
        drawRoundedRect(18, bagY, 28, 22, 7, '#111111');

        context.strokeStyle = '#ffffff';
        context.lineWidth = 3.5;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(24, bagY + 1);
        context.quadraticCurveTo(32, bagY - 9, 40, bagY + 1);
        context.stroke();

        context.strokeStyle = '#ffffff';
        context.lineWidth = 2.25;
        context.beginPath();
        context.moveTo(24, bagY + 10);
        context.lineTo(40, bagY + 10);
        context.stroke();

        context.strokeStyle = '#111111';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(42, bagY + 5);
        context.lineTo(48, bagY + 9);
        context.stroke();

        context.save();
        context.translate(50, bagY + 11);
        context.rotate(frame.angle);
        drawRoundedRect(-4.5, -6.5, 9, 13, 3, '#ffffff', '#111111', 2);
        context.fillStyle = '#111111';
        context.beginPath();
        context.arc(0, -2.2, 1.2, 0, Math.PI * 2);
        context.fill();
        context.restore();

        context.strokeStyle = '#ffffff';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(24, bagY + 16);
        context.lineTo(40, bagY + 16);
        context.stroke();

        context.strokeStyle = `rgba(255, 255, 255, ${frame.shine})`;
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(22, bagY + 4);
        context.lineTo(27, bagY + 1);
        context.stroke();

        iconLink.href = canvas.toDataURL('image/png');
    }

    function drawRoundedRect(x, y, width, height, radius, fillStyle, strokeStyle = '', lineWidth = 0) {
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(x + width - radius, y);
        context.quadraticCurveTo(x + width, y, x + width, y + radius);
        context.lineTo(x + width, y + height - radius);
        context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        context.lineTo(x + radius, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - radius);
        context.lineTo(x, y + radius);
        context.quadraticCurveTo(x, y, x + radius, y);
        context.closePath();

        if (fillStyle) {
            context.fillStyle = fillStyle;
            context.fill();
        }

        if (strokeStyle && lineWidth > 0) {
            context.strokeStyle = strokeStyle;
            context.lineWidth = lineWidth;
            context.stroke();
        }
    }
})();
