/**
 * AudioPlayer - WaveSurfer.js wrapper for Hellajay
 * Brutalist audio player with waveform visualization
 */
class AudioPlayer {
  static instances = [];

  constructor(playerEl) {
    this.playerEl = playerEl;
    this.audioUrl = playerEl.dataset.audioUrl || '/test.mp3';
    this.waveformEl = playerEl.querySelector('.audio-waveform');
    this.playBtn = playerEl.querySelector('.audio-play-btn');
    this.currentTimeEl = playerEl.querySelector('.audio-current');
    this.durationEl = playerEl.querySelector('.audio-duration');

    this.wavesurfer = null;
    this.init();

    AudioPlayer.instances.push(this);
  }

  init() {
    this.playerEl.classList.add('loading');
    this.createWaveSurfer();
    this.bindEvents();
    this.bindThemeChange();
  }

  getColors() {
    // Create a temporary element to resolve CSS color values
    // This handles light-dark() and other CSS color functions
    const temp = document.createElement('div');
    temp.style.display = 'none';
    document.body.appendChild(temp);

    const getResolvedColor = (cssVar, fallback) => {
      temp.style.color = `var(${cssVar})`;
      const resolved = getComputedStyle(temp).color;
      // Convert rgb(r, g, b) to hex
      const match = resolved.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match;
        return `#${[r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('')}`;
      }
      return fallback;
    };

    const colors = {
      waveColor: getResolvedColor('--color-muted', '#666666'),
      progressColor: getResolvedColor('--color-fg', '#000000'),
      cursorColor: getResolvedColor('--color-fg', '#000000')
    };

    document.body.removeChild(temp);
    return colors;
  }

  createWaveSurfer() {
    const colors = this.getColors();

    this.wavesurfer = WaveSurfer.create({
      container: this.waveformEl,
      waveColor: colors.waveColor,
      progressColor: colors.progressColor,
      cursorColor: colors.cursorColor,
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 0,
      height: 'auto',
      normalize: true,
      url: this.audioUrl
    });
  }

  bindEvents() {
    this.wavesurfer.on('ready', () => {
      this.playerEl.classList.remove('loading');
      this.updateTime();
    });

    this.wavesurfer.on('timeupdate', () => {
      this.updateTime();
    });

    this.wavesurfer.on('finish', () => {
      this.playBtn.setAttribute('data-playing', 'false');
    });

    this.wavesurfer.on('error', (error) => {
      console.error('WaveSurfer error:', error);
      this.playerEl.classList.remove('loading');
      this.playerEl.classList.add('error');
    });

    this.wavesurfer.on('play', () => {
      // Pause all other players
      AudioPlayer.instances.forEach(instance => {
        if (instance !== this && instance.wavesurfer.isPlaying()) {
          instance.wavesurfer.pause();
        }
      });
      this.playBtn.setAttribute('data-playing', 'true');
    });

    this.wavesurfer.on('pause', () => {
      this.playBtn.setAttribute('data-playing', 'false');
    });

    this.playBtn.addEventListener('click', () => {
      this.togglePlay();
    });

    this.playBtn.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.togglePlay();
      }
    });
  }

  bindThemeChange() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      this.updateColors();
    });
  }

  togglePlay() {
    this.wavesurfer.playPause();
  }

  updateTime() {
    const currentTime = this.wavesurfer.getCurrentTime();
    const duration = this.wavesurfer.getDuration();

    this.currentTimeEl.textContent = this.formatTime(currentTime);
    this.durationEl.textContent = this.formatTime(duration);
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) {
      return '0:00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  updateColors() {
    const colors = this.getColors();
    this.wavesurfer.setOptions({
      waveColor: colors.waveColor,
      progressColor: colors.progressColor,
      cursorColor: colors.cursorColor
    });
  }

  destroy() {
    if (this.wavesurfer) {
      this.wavesurfer.destroy();
    }
    const index = AudioPlayer.instances.indexOf(this);
    if (index > -1) {
      AudioPlayer.instances.splice(index, 1);
    }
  }

  static initAll() {
    document.querySelectorAll('.audio-player').forEach(el => {
      new AudioPlayer(el);
    });
  }
}
