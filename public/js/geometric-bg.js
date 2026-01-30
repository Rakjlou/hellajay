/**
 * Geometric mesh background generator
 * Creates animated connected lines without dots
 */

(function() {
  const sections = document.querySelectorAll('.section');

  sections.forEach((section, index) => {
    const svg = createGeometricMesh(section, index);
    section.insertBefore(svg, section.firstChild);
  });

  function createGeometricMesh(section, seedOffset) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('geometric-bg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');

    // Generate points
    const points = generatePoints(20 + seedOffset * 2, seedOffset);

    // Connect points that are close enough
    const lines = connectPoints(points, 150);

    // Create line elements
    lines.forEach((line, i) => {
      const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      lineEl.setAttribute('x1', line.x1 + '%');
      lineEl.setAttribute('y1', line.y1 + '%');
      lineEl.setAttribute('x2', line.x2 + '%');
      lineEl.setAttribute('y2', line.y2 + '%');
      lineEl.style.animationDelay = (i * 0.1 % 3) + 's';
      svg.appendChild(lineEl);
    });

    // Animate points slowly
    animatePoints(svg, points, lines);

    return svg;
  }

  function generatePoints(count, seed) {
    const points = [];
    // Simple seeded random for consistency
    const random = seededRandom(seed * 12345);

    for (let i = 0; i < count; i++) {
      points.push({
        x: random() * 100,
        y: random() * 100,
        vx: (random() - 0.5) * 0.3,
        vy: (random() - 0.5) * 0.3
      });
    }
    return points;
  }

  function seededRandom(seed) {
    return function() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  function connectPoints(points, maxDistance) {
    const lines = [];
    const maxDistPercent = maxDistance / 10; // Convert to percentage-ish

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxDistPercent) {
          lines.push({
            x1: points[i].x,
            y1: points[i].y,
            x2: points[j].x,
            y2: points[j].y,
            p1: i,
            p2: j
          });
        }
      }
    }
    return lines;
  }

  function animatePoints(svg, points, lines) {
    const lineElements = svg.querySelectorAll('line');

    function update() {
      // Move points
      points.forEach(point => {
        point.x += point.vx;
        point.y += point.vy;

        // Bounce off edges
        if (point.x < 0 || point.x > 100) point.vx *= -1;
        if (point.y < 0 || point.y > 100) point.vy *= -1;

        // Keep in bounds
        point.x = Math.max(0, Math.min(100, point.x));
        point.y = Math.max(0, Math.min(100, point.y));
      });

      // Update lines
      lines.forEach((line, i) => {
        const p1 = points[line.p1];
        const p2 = points[line.p2];
        lineElements[i].setAttribute('x1', p1.x + '%');
        lineElements[i].setAttribute('y1', p1.y + '%');
        lineElements[i].setAttribute('x2', p2.x + '%');
        lineElements[i].setAttribute('y2', p2.y + '%');
      });

      requestAnimationFrame(update);
    }

    // Check for reduced motion preference
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      update();
    }
  }
})();
