class BinaryCodedAutomata {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.imageData = null;
    this.pixelData = null;
    this.gridSize = 150;
    this.cellSize = 4;
    this.running = false;
    this.generation = 0;
    this.isZoomed = false;
    // Multi-ant system
    this.numAnts = 1;
    this.antSpawnMode = 'center';
    this.antSync = 'synchronized';
    this.ants = [];

    // Binary system parameters
    this.numColors = 4;
    this.antRule = [0, 1, 0, 1];
    this.activationMask = [1, 0, 1, 0];
    this.activationMode = [1, 0, 1, 0]; // 1 = positive activation, 0 = negative activation
    this.colorPalette = [
      '#000000',
      '#333333',
      '#666666',
      '#999999',
      '#cc3333',
      '#3333cc',
      '#33cc33',
      '#cccc33',
    ];
    this.colorPaletteRGB = this.colorPalette.map((hex) => this.hexToRgb(hex));

    // Grid states
    this.substrateGrid = [];
    this.lifeGrid = [];
    this.markedGrid = [];
    this.inhibitionGrid = []; // Track cells that have been negatively activated

    // Parameters
    this.lifeRadius = 2;
    this.birthRule = 3;
    this.survivalMin = 2;
    this.survivalMax = 3;
    this.antActivationRadius = 2;
    this.activationProbability = 0.4;
    this.speed = 30;

    this.setupEventListeners();
    this.updateCanvasSize();
    this.updateColorGrid();
    this.updateRuleEditors();
    this.initializeAnts();
    this.reset();
  }
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }

  setupEventListeners() {
    document.getElementById('startStop').addEventListener('click', () => this.toggleSimulation());
    document.getElementById('step').addEventListener('click', () => this.step());
    document.getElementById('reset').addEventListener('click', () => this.reset());
    document.getElementById('randomize').addEventListener('click', () => this.randomize());
    document.getElementById('randomizeRule').addEventListener('click', () => this.randomizeRule());
    document.getElementById('randomizeMask').addEventListener('click', () => this.randomizeMask());
    // Canvas zoom functionality
    this.canvas.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleZoom();
    });
    // ESC key to exit zoom
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isZoomed) {
        this.toggleZoom();
      }
    });
    // Handle window resize when zoomed
    window.addEventListener('resize', () => {
      if (this.isZoomed) {
        this.updateZoomedCanvasSize();
      }
    });

    document.getElementById('speed').addEventListener('input', (e) => {
      this.speed = parseInt(e.target.value);
      const speedText =
        this.speed >= 1000 ? (this.speed / 1000).toFixed(1) + ' s' : this.speed + ' ms';
      document.getElementById('speedValue').textContent = speedText;
    });

    document.getElementById('numColors').addEventListener('input', (e) => {
      this.numColors = parseInt(e.target.value);
      document.getElementById('numColorsValue').textContent = this.numColors;
      this.resizeRules();
      this.updateColorGrid();
      this.updateRuleEditors();
    });

    document.getElementById('numAnts').addEventListener('input', (e) => {
      this.numAnts = parseInt(e.target.value);
      document.getElementById('numAntsValue').textContent = this.numAnts;
      this.initializeAnts();
    });

    document.getElementById('antSpawnMode').addEventListener('change', (e) => {
      this.antSpawnMode = e.target.value;
      this.initializeAnts();
    });

    document.getElementById('antSync').addEventListener('change', (e) => {
      this.antSync = e.target.value;
      this.initializeAnts();
    });

    document.getElementById('lifeRadius').addEventListener('input', (e) => {
      this.lifeRadius = parseInt(e.target.value);
      document.getElementById('radiusValue').textContent = this.lifeRadius;
    });

    document.getElementById('birthRule').addEventListener('input', (e) => {
      this.birthRule = parseInt(e.target.value);
    });

    document.getElementById('survivalMin').addEventListener('input', (e) => {
      this.survivalMin = parseInt(e.target.value);
    });

    document.getElementById('survivalMax').addEventListener('input', (e) => {
      this.survivalMax = parseInt(e.target.value);
    });

    document.getElementById('antActivationRadius').addEventListener('input', (e) => {
      this.antActivationRadius = parseInt(e.target.value);
      document.getElementById('antRadiusValue').textContent = this.antActivationRadius;
    });

    document.getElementById('activationProbability').addEventListener('input', (e) => {
      this.activationProbability = parseInt(e.target.value) / 100;
      document.getElementById('activationProbValue').textContent = parseInt(e.target.value) + '%';
    });

    document.getElementById('gridSize').addEventListener('change', (e) => {
      this.gridSize = parseInt(e.target.value);
      this.updateCanvasSize();
      this.initializeAnts();
      this.reset();
    });
  }

  initializeAnts() {
    this.ants = [];
    const positions = this.getAntSpawnPositions();

    for (let i = 0; i < this.numAnts; i++) {
      const ant = {
        id: i,
        x: positions[i].x,
        y: positions[i].y,
        dir: Math.floor(Math.random() * 4),
        steps: 0,
        color: this.getAntColor(i),
        rule: this.getAntRule(i),
        activationMask: this.getAntActivationMask(i),
        activationMode: this.getAntActivationMode(i),
      };
      this.ants.push(ant);
    }
  }

  getAntSpawnPositions() {
    const positions = [];
    const centerX = Math.floor(this.gridSize / 2);
    const centerY = Math.floor(this.gridSize / 2);

    switch (this.antSpawnMode) {
      case 'center':
        for (let i = 0; i < this.numAnts; i++) {
          const angle = (i / this.numAnts) * 2 * Math.PI;
          const radius = Math.min(5, i * 2);
          positions.push({
            x: Math.floor(centerX + Math.cos(angle) * radius),
            y: Math.floor(centerY + Math.sin(angle) * radius),
          });
        }
        break;

      case 'corners':
        const corners = [
          { x: 10, y: 10 },
          { x: this.gridSize - 10, y: 10 },
          { x: this.gridSize - 10, y: this.gridSize - 10 },
          { x: 10, y: this.gridSize - 10 },
          { x: centerX, y: 10 },
          { x: this.gridSize - 10, y: centerY },
          { x: centerX, y: this.gridSize - 10 },
          { x: 10, y: centerY },
        ];
        for (let i = 0; i < this.numAnts; i++) {
          positions.push(corners[i % corners.length]);
        }
        break;

      case 'edges':
        for (let i = 0; i < this.numAnts; i++) {
          const edge = i % 4;
          const progress = (i / this.numAnts) * 0.8 + 0.1;
          switch (edge) {
            case 0:
              positions.push({
                x: Math.floor(this.gridSize * progress),
                y: 10,
              });
              break;
            case 1:
              positions.push({
                x: this.gridSize - 10,
                y: Math.floor(this.gridSize * progress),
              });
              break;
            case 2:
              positions.push({
                x: Math.floor(this.gridSize * (1 - progress)),
                y: this.gridSize - 10,
              });
              break;
            case 3:
              positions.push({
                x: 10,
                y: Math.floor(this.gridSize * (1 - progress)),
              });
              break;
          }
        }
        break;

      case 'grid':
        const gridSize = Math.ceil(Math.sqrt(this.numAnts));
        const spacing = Math.floor(this.gridSize / (gridSize + 1));
        for (let i = 0; i < this.numAnts; i++) {
          const row = Math.floor(i / gridSize);
          const col = i % gridSize;
          positions.push({
            x: spacing * (col + 1),
            y: spacing * (row + 1),
          });
        }
        break;

      case 'random':
      default:
        for (let i = 0; i < this.numAnts; i++) {
          positions.push({
            x: Math.floor(Math.random() * (this.gridSize - 20)) + 10,
            y: Math.floor(Math.random() * (this.gridSize - 20)) + 10,
          });
        }
        break;
    }

    return positions;
  }

  getAntColor(index) {
    const colors = [
      '#ff3333',
      '#33ff33',
      '#3333ff',
      '#ffff33',
      '#ff33ff',
      '#33ffff',
      '#ff8833',
      '#8833ff',
    ];
    return colors[index % colors.length];
  }

  getAntRule(index) {
    switch (this.antSync) {
      case 'synchronized':
        return [...this.antRule];
      case 'independent':
        return Array.from({ length: this.numColors }, () => Math.floor(Math.random() * 2));
      case 'offset':
        const offsetRule = [...this.antRule];
        for (let i = 0; i < index; i++) {
          offsetRule.push(offsetRule.shift());
        }
        return offsetRule;
      default:
        return [...this.antRule];
    }
  }

  getAntActivationMask(index) {
    switch (this.antSync) {
      case 'synchronized':
        return [...this.activationMask];
      case 'independent':
        return Array.from({ length: this.numColors }, () => Math.floor(Math.random() * 2));
      case 'offset':
        const offsetMask = [...this.activationMask];
        for (let i = 0; i < index; i++) {
          offsetMask.push(offsetMask.shift());
        }
        return offsetMask;
      default:
        return [...this.activationMask];
    }
  }
  getAntActivationMode(index) {
    switch (this.antSync) {
      case 'synchronized':
        return [...this.activationMode];
      case 'independent':
        return Array.from({ length: this.numColors }, () => Math.floor(Math.random() * 2));
      case 'offset':
        const offsetMode = [...this.activationMode];
        for (let i = 0; i < index; i++) {
          offsetMode.push(offsetMode.shift());
        }
        return offsetMode;
      default:
        return [...this.activationMode];
    }
  }

  resizeRules() {
    while (this.antRule.length < this.numColors) {
      this.antRule.push(Math.floor(Math.random() * 2));
    }
    while (this.activationMask.length < this.numColors) {
      this.activationMask.push(Math.floor(Math.random() * 2));
    }
    while (this.activationMode.length < this.numColors) {
      this.activationMode.push(Math.floor(Math.random() * 2));
    }
    this.antRule = this.antRule.slice(0, this.numColors);
    this.activationMask = this.activationMask.slice(0, this.numColors);
    this.activationMode = this.activationMode.slice(0, this.numColors);

    if (this.ants && this.ants.length > 0) {
      this.initializeAnts();
    }
  }

  updateColorGrid() {
    const grid = document.getElementById('colorGrid');
    grid.innerHTML = '';

    for (let i = 0; i < this.numColors; i++) {
      const cell = document.createElement('div');
      cell.className = 'color-cell';
      cell.style.backgroundColor = this.colorPalette[i];
      cell.title = `Color ${i}`;
      grid.appendChild(cell);
    }
  }

  updateRuleEditors() {
    this.updateRuleEditor('antRuleEditor', 'antRuleDisplay', this.antRule);
    this.updateRuleEditor('activationMaskEditor', 'activationMaskDisplay', this.activationMask);
    this.updateActivationModeEditor();
  }

  updateRuleEditor(editorId, displayId, rule) {
    const editor = document.getElementById(editorId);
    editor.innerHTML = '';

    for (let i = 0; i < this.numColors; i++) {
      const row = document.createElement('div');
      row.className = 'rule-row';

      const colorIndicator = document.createElement('div');
      colorIndicator.style.width = '20px';
      colorIndicator.style.height = '20px';
      colorIndicator.style.backgroundColor = this.colorPalette[i];
      colorIndicator.style.border = '1px solid #666';
      colorIndicator.style.borderRadius = '3px';

      const bit = document.createElement('div');
      bit.className = `rule-bit ${rule[i] ? 'active' : ''}`;
      bit.textContent = rule[i];
      bit.addEventListener('click', () => {
        rule[i] = 1 - rule[i];
        bit.textContent = rule[i];
        bit.className = `rule-bit ${rule[i] ? 'active' : ''}`;

        if (editorId === 'antRuleEditor') {
          this.antRule[i] = rule[i];
        } else if (editorId === 'activationMaskEditor') {
          this.activationMask[i] = rule[i];
        }
        this.updateRuleDisplay();

        label.textContent = `Color ${i}: ${editorId.includes('antRule') ? (rule[i] ? 'Right' : 'Left') : rule[i] ? 'Activate' : 'No Effect'}`;
      });

      const label = document.createElement('span');
      label.textContent = `Color ${i}: ${editorId.includes('antRule') ? (rule[i] ? 'Right' : 'Left') : rule[i] ? 'Activate' : 'No Effect'}`;

      row.appendChild(colorIndicator);
      row.appendChild(bit);
      row.appendChild(label);
      editor.appendChild(row);
    }
  }
  updateActivationModeEditor() {
    const container = document.getElementById('activationMaskEditor').parentElement;
    let modeEditor = document.getElementById('activationModeEditor');
    if (!modeEditor) {
      const modeGroup = document.createElement('div');
      modeGroup.style.marginTop = '15px';
      const modeLabel = document.createElement('label');
      modeLabel.textContent = 'Activation Mode (+/-)';
      modeLabel.style.color = '#00ff88';
      modeLabel.style.fontWeight = 'bold';
      modeLabel.style.fontSize = '13px';
      modeLabel.style.textTransform = 'uppercase';
      modeLabel.style.letterSpacing = '0.5px';
      modeLabel.style.marginBottom = '5px';
      modeLabel.style.display = 'block';
      modeEditor = document.createElement('div');
      modeEditor.id = 'activationModeEditor';
      modeEditor.className = 'rule-editor';
      modeGroup.appendChild(modeLabel);
      modeGroup.appendChild(modeEditor);
      container.appendChild(modeGroup);
    }
    modeEditor.innerHTML = '';
    for (let i = 0; i < this.numColors; i++) {
      const row = document.createElement('div');
      row.className = 'rule-row';
      const colorIndicator = document.createElement('div');
      colorIndicator.style.width = '20px';
      colorIndicator.style.height = '20px';
      colorIndicator.style.backgroundColor = this.colorPalette[i];
      colorIndicator.style.border = '1px solid #666';
      colorIndicator.style.borderRadius = '3px';
      const modeButton = document.createElement('div');
      modeButton.className = 'rule-bit';
      modeButton.style.width = '30px';
      modeButton.textContent = this.activationMode[i] ? '+' : '-';
      modeButton.style.backgroundColor = this.activationMode[i] ? '#00ff88' : '#ff3333';
      modeButton.style.color = this.activationMode[i] ? '#000' : '#fff';
      modeButton.style.fontWeight = 'bold';
      modeButton.style.fontSize = '16px';
      modeButton.addEventListener('click', () => {
        this.activationMode[i] = 1 - this.activationMode[i];
        modeButton.textContent = this.activationMode[i] ? '+' : '-';
        modeButton.style.backgroundColor = this.activationMode[i] ? '#00ff88' : '#ff3333';
        modeButton.style.color = this.activationMode[i] ? '#000' : '#fff';
        label.textContent = `Color ${i}: ${this.activationMode[i] ? 'Positive' : 'Negative'}`;
      });
      const label = document.createElement('span');
      label.textContent = `Color ${i}: ${this.activationMode[i] ? 'Positive (Normal)' : 'Negative (Isolated)'}`;
      row.appendChild(colorIndicator);
      row.appendChild(modeButton);
      row.appendChild(label);
      modeEditor.appendChild(row);
    }
  }

  updateRuleDisplay() {
    document.getElementById('antRuleDisplay').textContent = this.antRule.join('');
    document.getElementById('activationMaskDisplay').textContent = this.activationMask.join('');
    document.getElementById('currentMask').textContent = this.activationMask.join('');
  }

  updateCanvasSize() {
    if (this.isZoomed) {
      this.updateZoomedCanvasSize();
    } else {
      this.updateNormalCanvasSize();
    }
  }

  updateNormalCanvasSize() {
    const maxCanvasSize = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.6, 800);
    this.cellSize = Math.max(1, Math.floor(maxCanvasSize / this.gridSize));
    const actualCanvasSize = this.gridSize * this.cellSize;
    this.canvas.width = actualCanvasSize;
    this.canvas.height = actualCanvasSize;
    this.imageData = this.ctx.createImageData(actualCanvasSize, actualCanvasSize);
    this.pixelData = this.imageData.data;
  }

  updateZoomedCanvasSize() {
    const maxWidth = window.innerWidth - 40;
    const maxHeight = window.innerHeight - 40;
    const maxCanvasSize = Math.min(maxWidth, maxHeight);
    this.cellSize = Math.max(1, Math.floor(maxCanvasSize / this.gridSize));
    const actualCanvasSize = this.gridSize * this.cellSize;
    this.canvas.width = actualCanvasSize;
    this.canvas.height = actualCanvasSize;
    this.imageData = this.ctx.createImageData(actualCanvasSize, actualCanvasSize);
    this.pixelData = this.imageData.data;
  }
  toggleZoom() {
    this.isZoomed = !this.isZoomed;
    const container = document.querySelector('.canvas-container');
    const hint = document.querySelector('.zoom-hint');
    if (this.isZoomed) {
      container.classList.add('zoomed');
      hint.textContent = 'Click or press ESC to exit zoom';
      document.body.style.overflow = 'hidden';
      this.updateZoomedCanvasSize();
    } else {
      container.classList.remove('zoomed');
      hint.textContent = 'Click to zoom';
      document.body.style.overflow = '';
      this.updateNormalCanvasSize();
    }
    // Redraw with new size
    this.draw();
  }

  reset() {
    this.running = false;
    this.generation = 0;

    this.initializeAnts();

    this.substrateGrid = new Array(this.gridSize)
      .fill(null)
      .map(() => new Array(this.gridSize).fill(0));
    this.lifeGrid = new Array(this.gridSize).fill(null).map(() => new Array(this.gridSize).fill(0));
    this.markedGrid = new Array(this.gridSize)
      .fill(null)
      .map(() => new Array(this.gridSize).fill(0));
    this.inhibitionGrid = new Array(this.gridSize)
      .fill(null)
      .map(() => new Array(this.gridSize).fill(0));

    document.getElementById('startStop').textContent = 'Start';
    this.updateStats();
    this.draw();
  }

  randomize() {
    this.randomizeRule();
    this.randomizeMask();

    this.lifeRadius = Math.floor(Math.random() * 5) + 1;
    document.getElementById('lifeRadius').value = this.lifeRadius;
    document.getElementById('radiusValue').textContent = this.lifeRadius;

    this.birthRule = Math.floor(Math.random() * 8) + 1;
    document.getElementById('birthRule').value = this.birthRule;

    this.survivalMin = Math.floor(Math.random() * 4) + 1;
    document.getElementById('survivalMin').value = this.survivalMin;

    this.survivalMax = this.survivalMin + Math.floor(Math.random() * (8 - this.survivalMin));
    document.getElementById('survivalMax').value = this.survivalMax;

    this.antActivationRadius = Math.floor(Math.random() * 4) + 1;
    document.getElementById('antActivationRadius').value = this.antActivationRadius;
    document.getElementById('antRadiusValue').textContent = this.antActivationRadius;

    this.activationProbability = Math.random() * 0.8 + 0.1;
    document.getElementById('activationProbability').value = Math.floor(
      this.activationProbability * 100
    );
    document.getElementById('activationProbValue').textContent =
      Math.floor(this.activationProbability * 100) + '%';

    this.speed = Math.floor(Math.random() * 500) + 10;
    document.getElementById('speed').value = this.speed;
    const speedText =
      this.speed >= 1000 ? (this.speed / 1000).toFixed(1) + ' s' : this.speed + ' ms';
    document.getElementById('speedValue').textContent = speedText;
  }

  randomizeRule() {
    for (let i = 0; i < this.numColors; i++) {
      this.antRule[i] = Math.floor(Math.random() * 2);
    }
    this.updateRuleEditors();
    this.updateRuleDisplay();

    if (this.ants && this.ants.length > 0) {
      this.initializeAnts();
    }
  }

  randomizeMask() {
    for (let i = 0; i < this.numColors; i++) {
      this.activationMask[i] = Math.floor(Math.random() * 2);
    }
    for (let i = 0; i < this.numColors; i++) {
      this.activationMode[i] = Math.floor(Math.random() * 2);
    }
    this.updateRuleEditors();
    this.updateRuleDisplay();

    if (this.ants && this.ants.length > 0) {
      this.initializeAnts();
    }
  }

  toggleSimulation() {
    this.running = !this.running;
    document.getElementById('startStop').textContent = this.running ? 'Stop' : 'Start';

    if (this.running) {
      this.run();
    }
  }

  run() {
    if (!this.running) return;

    this.step();
    setTimeout(() => this.run(), this.speed);
  }

  step() {
    this.moveAllAnts();
    this.updateLife();

    this.generation++;
    this.updateStats();
    this.draw();
  }

  moveAllAnts() {
    for (let ant of this.ants) {
      this.moveAnt(ant);
    }
  }

  moveAnt(ant) {
    const currentColor = this.substrateGrid[ant.y][ant.x];
    const turnRight = ant.rule[currentColor];

    if (turnRight) {
      ant.dir = (ant.dir + 1) % 4;
    } else {
      ant.dir = (ant.dir + 3) % 4;
    }

    // Check if this color should activate life using the global activation mask
    const shouldActivate = this.activationMask[currentColor];
    const isPositiveMode = this.activationMode[currentColor];

    this.substrateGrid[ant.y][ant.x] = (this.substrateGrid[ant.y][ant.x] + 1) % this.numColors;
    this.markedGrid[ant.y][ant.x] = 1;

    if (shouldActivate) {
      this.activateLifeAroundAnt(ant, isPositiveMode);
    }

    const dx = [0, 1, 0, -1][ant.dir];
    const dy = [-1, 0, 1, 0][ant.dir];

    ant.x = (ant.x + dx + this.gridSize) % this.gridSize;
    ant.y = (ant.y + dy + this.gridSize) % this.gridSize;

    ant.steps++;
  }

  activateLifeAroundAnt(ant, isPositiveMode) {
    if (this.antActivationRadius === 0) return;

    const radius = this.antActivationRadius;
    const radiusSquared = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > radiusSquared) continue;

        const nx = (ant.x + dx + this.gridSize) % this.gridSize;
        const ny = (ant.y + dy + this.gridSize) % this.gridSize;

        const targetSubstrateColor = this.substrateGrid[ny][nx];

        // Use the global activation mask to determine if this substrate can host life
        if (!this.activationMask[targetSubstrateColor]) {
          continue;
        }

        const isMarked = this.markedGrid[ny][nx];
        if (targetSubstrateColor !== 0 && !isMarked) {
          continue;
        }

        const distance = Math.sqrt(distanceSquared);
        const activationChance = Math.max(0, 1 - distance / (radius + 1));

        if (Math.random() < activationChance * this.activationProbability) {
          if (isPositiveMode) {
            // Positive activation: create life and remove inhibition
            this.lifeGrid[ny][nx] = 1;
            this.inhibitionGrid[ny][nx] = 0;
          } else {
            // Negative activation: kill life and add inhibition
            this.lifeGrid[ny][nx] = 0;
            this.inhibitionGrid[ny][nx] = 1;
          }
        }
      }
    }
  }

  updateLife() {
    const newLifeGrid = new Array(this.gridSize)
      .fill(null)
      .map(() => new Array(this.gridSize).fill(0));
    const radius = this.lifeRadius;
    const radiusSquared = radius * radius;

    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        const substrateColor = this.substrateGrid[y][x];

        // Check if this substrate color can host life according to the global activation mask
        if (!this.activationMask[substrateColor]) {
          continue; // Skip cells with substrate colors that can't host life
        }

        const isMarked = this.markedGrid[y][x];
        if (substrateColor !== 0 && !isMarked) {
          continue;
        }
        // Skip cells that are inhibited
        if (this.inhibitionGrid[y][x] === 1) {
          // Decay inhibition over time
          if (Math.random() < 0.1) {
            this.inhibitionGrid[y][x] = 0;
          }
          continue;
        }

        const neighbors = this.countLifeNeighbors(x, y, radius, radiusSquared);
        const isAlive = this.lifeGrid[y][x] === 1;
        // Get the activation mode for this cell's substrate
        const cellMode = this.activationMode[substrateColor];

        if (isAlive) {
          // For negative mode cells, they might need different survival rules
          // or be more fragile
          const survivalMin = cellMode ? this.survivalMin : Math.max(1, this.survivalMin - 1);
          const survivalMax = cellMode ? this.survivalMax : this.survivalMax - 1;

          if (neighbors >= survivalMin && neighbors <= survivalMax) {
            newLifeGrid[y][x] = 1;
          }
        } else {
          // Birth rules might also differ based on mode
          const birthRule = cellMode ? this.birthRule : Math.max(2, this.birthRule - 1);

          if (neighbors === birthRule) {
            newLifeGrid[y][x] = 1;
          }
        }
      }
    }

    this.lifeGrid = newLifeGrid;
  }

  countLifeNeighbors(x, y, radius, radiusSquared) {
    let count = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > radiusSquared) continue;

        const nx = (x + dx + this.gridSize) % this.gridSize;
        const ny = (y + dy + this.gridSize) % this.gridSize;

        const neighborSubstrateColor = this.substrateGrid[ny][nx];

        // Check against the global activation mask
        if (!this.activationMask[neighborSubstrateColor]) {
          continue; // Skip neighbors on non-life-compatible substrate
        }
        // Check if the neighbor's substrate has the same activation mode as the current cell
        const currentSubstrateColor = this.substrateGrid[y][x];
        const currentMode = this.activationMode[currentSubstrateColor];
        const neighborMode = this.activationMode[neighborSubstrateColor];
        // Mutual inhibition: only count neighbors with the same activation mode
        if (currentMode !== neighborMode) {
          continue;
        }

        const isMarked = this.markedGrid[ny][nx];
        if (neighborSubstrateColor !== 0 && !isMarked) {
          continue;
        }

        if (this.lifeGrid[ny][nx] === 1) {
          count++;
        }
      }
    }

    return count;
  }

  updateStats() {
    document.getElementById('generation').textContent = this.generation;

    const totalSteps = this.ants.reduce((sum, ant) => sum + ant.steps, 0);
    document.getElementById('antSteps').textContent = totalSteps;

    let markedCount = 0;
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        if (this.markedGrid[y][x]) markedCount++;
      }
    }
    document.getElementById('markedCells').textContent = markedCount;

    let liveCells = 0;
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        if (this.lifeGrid[y][x] === 1) liveCells++;
      }
    }
    document.getElementById('liveCells').textContent = liveCells;
    document.getElementById('numAntsDisplay').textContent = this.numAnts;
    let inhibitedCells = 0;
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        if (this.inhibitionGrid[y][x] === 1) inhibitedCells++;
      }
    }
    document.getElementById('inhibitedCells').textContent = inhibitedCells;
  }

  draw() {
    // Clear pixel data
    this.pixelData.fill(0);

    // Draw substrate using ImageData for better performance
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        if (this.markedGrid[y][x]) {
          const colorIndex = this.substrateGrid[y][x];
          const color = this.colorPaletteRGB[colorIndex];

          for (let py = 0; py < this.cellSize; py++) {
            for (let px = 0; px < this.cellSize; px++) {
              const pixelX = x * this.cellSize + px;
              const pixelY = y * this.cellSize + py;
              const index = (pixelY * this.canvas.width + pixelX) * 4;

              this.pixelData[index] = color.r; // R
              this.pixelData[index + 1] = color.g; // G
              this.pixelData[index + 2] = color.b; // B
              this.pixelData[index + 3] = 255; // A
            }
          }
        }
      }
    }

    // Draw life cells using ImageData
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        if (this.lifeGrid[y][x] === 1) {
          const startX = Math.floor(x * this.cellSize + this.cellSize * 0.1);
          const startY = Math.floor(y * this.cellSize + this.cellSize * 0.1);
          const endX = Math.floor(x * this.cellSize + this.cellSize * 0.9);
          const endY = Math.floor(y * this.cellSize + this.cellSize * 0.9);

          for (let py = startY; py < endY; py++) {
            for (let px = startX; px < endX; px++) {
              const index = (py * this.canvas.width + px) * 4;
              this.pixelData[index] = 0; // R
              this.pixelData[index + 1] = 255; // G
              this.pixelData[index + 2] = 136; // B
              this.pixelData[index + 3] = 255; // A
            }
          }
        }
      }
    }
    // Draw inhibited cells with a dark red overlay
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        if (this.inhibitionGrid[y][x] === 1) {
          for (let py = 0; py < this.cellSize; py++) {
            for (let px = 0; px < this.cellSize; px++) {
              const pixelX = x * this.cellSize + px;
              const pixelY = y * this.cellSize + py;
              const index = (pixelY * this.canvas.width + pixelX) * 4;
              // Blend with existing color
              this.pixelData[index] = Math.min(255, this.pixelData[index] + 80); // R
              this.pixelData[index + 1] = Math.max(0, this.pixelData[index + 1] - 40); // G
              this.pixelData[index + 2] = Math.max(0, this.pixelData[index + 2] - 40); // B
            }
          }
        }
      }
    }

    // Put the image data to canvas
    this.ctx.putImageData(this.imageData, 0, 0);

    // Draw ants using traditional canvas methods (they're few and need special effects)
    for (let ant of this.ants) {
      this.ctx.fillStyle = ant.color;
      this.ctx.shadowColor = ant.color;
      this.ctx.shadowBlur = 3;
      this.ctx.fillRect(
        ant.x * this.cellSize + this.cellSize * 0.2,
        ant.y * this.cellSize + this.cellSize * 0.2,
        this.cellSize * 0.6,
        this.cellSize * 0.6
      );

      this.ctx.fillStyle = '#ffff00';
      this.ctx.shadowColor = '#ffff00';
      const centerX = ant.x * this.cellSize + this.cellSize * 0.5;
      const centerY = ant.y * this.cellSize + this.cellSize * 0.5;
      const dx = [0, 1, 0, -1][ant.dir] * this.cellSize * 0.3;
      const dy = [-1, 0, 1, 0][ant.dir] * this.cellSize * 0.3;

      this.ctx.beginPath();
      this.ctx.arc(centerX + dx, centerY + dy, this.cellSize * 0.1, 0, 2 * Math.PI);
      this.ctx.fill();

      if (this.numAnts > 1) {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = `${Math.max(8, this.cellSize * 0.4)}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(ant.id.toString(), centerX, centerY + this.cellSize * 0.15);
      }
    }
    this.ctx.shadowBlur = 0;

    if (!this.running && this.antActivationRadius > 0 && this.ants.length > 0) {
      const firstAnt = this.ants[0];
      const centerX = firstAnt.x * this.cellSize + this.cellSize * 0.5;
      const centerY = firstAnt.y * this.cellSize + this.cellSize * 0.5;

      this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, this.antActivationRadius * this.cellSize, 0, 2 * Math.PI);
      this.ctx.stroke();
    }
  }
}
new BinaryCodedAutomata();
