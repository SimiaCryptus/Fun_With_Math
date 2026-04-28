# Fun With Math

A collection of interactive mathematical experiments—all running live in your browser with no installation required.

## 🚀 Getting Started

Open `index.html` in any modern web browser, or serve the folder with any static file server:

```bash
npx serve .
# or
python -m http.server
```

Then navigate to the URL shown in your terminal (e.g. `http://localhost:3000` for `serve`, `http://localhost:8000` for Python).

## 🧮 Experiments

| Experiment | Description |
|---|---|
| [Mandelbrot Set](experiments/mandelbrot.html) | Zoom and pan the iconic complex-plane fractal |
| [Prime Number Sieve](experiments/primes.html) | Animated Sieve of Eratosthenes |
| [Fourier Series](experiments/fourier.html) | Build waveforms from rotating circles |
| [Collatz Conjecture](experiments/collatz.html) | Visualize the 3n+1 sequence |

## 🗂 Project Structure

```
index.html              ← Landing page / experiment gallery
css/
  style.css             ← Shared stylesheet
experiments/
  mandelbrot.html       ← Mandelbrot Set Explorer
  primes.html           ← Prime Number Sieve
  fourier.html          ← Fourier Series Visualizer
  collatz.html          ← Collatz Conjecture
```

## 📄 License

See [LICENSE](LICENSE).
