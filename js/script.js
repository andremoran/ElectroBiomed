//EMG
let chartA0, chartA1, chartFFTA0, chartFFTA1;
let dataA0 = [], dataA1 = [];
let envelopeA0 = [], envelopeA1 = [];
let fftDataA0 = [], fftDataA1 = [];
let maxDataPoints = 1000;
let isRunning = true;
let socket;
let maxTime = 15;
let startTime = Date.now();
let windowSize = 50; // Tamaño de la ventana para el cálculo RMS
let fftSize = 512; // Tamaño de la FFT
let samplingRate = 1000; // Frecuencia de muestreo en Hz (ajusta según tu Arduino)


function calculateRMS(data, windowSize) {
    if (data.length < windowSize) return 0;
    const slice = data.slice(-windowSize);
    const sum = slice.reduce((acc, val) => acc + val.y * val.y, 0);
    return Math.sqrt(sum / windowSize);
}

function calculateFFT(data) {
    let fft = new FFT(fftSize, samplingRate);
    let signal = new Float32Array(fftSize);
    
    // Rellenar con los últimos 5 segundos de datos o ceros si no hay suficientes
    const startIndex = Math.max(0, data.length - samplingRate * 5);
    for (let i = 0; i < fftSize; i++) {
        signal[i] = i < data.length - startIndex ? data[i + startIndex].y : 0;
    }

    fft.forward(signal);

    let spectrum = new Array(fftSize / 2);
    for (let i = 0; i < fftSize / 2; i++) {
        let freq = i * samplingRate / fftSize;
        let mag = fft.spectrum[i];
        spectrum[i] = { x: freq, y: mag };
    }

    return spectrum;
}

function calculateMedianFrequency(spectrum) {
    let totalPower = spectrum.reduce((sum, point) => sum + point.y, 0);
    let cumulativePower = 0;
    for (let point of spectrum) {
        cumulativePower += point.y;
        if (cumulativePower >= totalPower / 2) {
            return point.x;
        }
    }
    return 0;
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado');

    const ctxA0 = document.getElementById('chartA0').getContext('2d');
    const ctxA1 = document.getElementById('chartA1').getContext('2d');

    const chartOptions = {
        responsive: true,
        scales: {
            x: {
                type: 'linear',
                position: 'bottom',
                title: {
                    display: true,
                    text: 'Tiempo (s)'
                },
                min: 0,
                max: maxTime
            },
            y: {
                title: {
                    display: true,
                    text: 'Voltaje'
                },
                min: 0,
                max: 3.5
            }
        },
        animation: {
            duration: 0
        },
        responsiveAnimationDuration: 0,
        elements: {
            line: {
                tension: 0
            },
            point: {
                radius: 0
            }
        },
        plugins: {
            legend: {
            display: true,
            position: 'top',
            labels: {
                boxWidth: 6,  // Hace los cuadros de color más pequeños
                font: {
                    size: 8  // Hace el texto de la leyenda más pequeño
                }
            }
          }
        }
    };


    
    chartA0 = new Chart(ctxA0, {
        type: 'line',
        data: {
            datasets: [{
                label: 'EMG - PIN A0 - Músculo Agonista',
                data: dataA0,
                borderColor: 'blue',
                tension: 0.1
            }, {
                label: 'Envolvente RMS A0',
                data: envelopeA0,
                borderColor: 'yellow',
                backgroundColor: 'rgba(255, 255, 0, 0.2)',
                fill: true,
                tension: 0.1
            }]
        },
        options: chartOptions
    });

    chartA1 = new Chart(ctxA1, {
        type: 'line',
        data: {
            datasets: [{
                label: 'EMG - PIN A1 - Músculo Antagonista',
                data: dataA1,
                borderColor: 'red',
                tension: 0.1
            }, {
                label: 'Envolvente RMS A1',
                data: envelopeA1,
                borderColor: 'yellow',
                backgroundColor: 'rgba(255, 255, 0, 0.2)',
                fill: true,
                tension: 0.1
            }]
        },
        options: chartOptions
    });

    document.getElementById('startButton').addEventListener('click', startDataCollection);
    document.getElementById('stopButton').addEventListener('click', stopDataCollection);



    const ctxFFTA0 = document.getElementById('chartFFTA0').getContext('2d');
    const ctxFFTA1 = document.getElementById('chartFFTA1').getContext('2d');

    const fftChartOptions = {
        responsive: true,
        scales: {
            x: {
                type: 'linear',
                position: 'bottom',
                title: {
                    display: true,
                    text: 'Frecuencia (Hz)'
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Potencia'
                },
                min: 0
            }
        },
        animation: {
            duration: 0
        },
        plugins: {
            annotation: {
                annotations: {
                    medianLine: {
                        type: 'line',
                        yMin: 0,
                        yMax: 1,
                        borderColor: 'rgb(255, 99, 132)',
                        borderWidth: 2,
                    }
                }
            },
            legend: {
                display: true,
                position: 'top',
                labels: {
                    boxWidth: 5,  // Hace los cuadros de color más pequeños
                    font: {
                        size: 8  // Hace el texto de la leyenda más pequeño
                    }
                }
            }
            
        }
    };



    chartFFTA0 = new Chart(ctxFFTA0, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Espectro de Potencia A0',
                data: fftDataA0,
                borderColor: 'blue',
                tension: 0.1
            }]
        },
        options: fftChartOptions
    });

    chartFFTA1 = new Chart(ctxFFTA1, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Espectro de Potencia A1',
                data: fftDataA1,
                borderColor: 'red',
                tension: 0.1
            }]
        },
        options: fftChartOptions
    });



    socket = io();

    socket.on('arduinoData', (data) => {
        if (!isRunning) return;

        const [valueA0, valueA1] = data.split(',').map(Number);
        const currentTime = (Date.now() - startTime) / 1000;

        if (document.getElementById('channelA0Checkbox').checked) {
            dataA0.push({ x: currentTime, y: valueA0 });
            const rmsA0 = calculateRMS(dataA0, windowSize);
            envelopeA0.push({ x: currentTime, y: rmsA0 });

            if (dataA0.length % 100 === 0) {  // Actualizar FFT cada 100 muestras
                fftDataA0 = calculateFFT(dataA0);
                const medianFreqA0 = calculateMedianFrequency(fftDataA0);
                chartFFTA0.options.plugins.annotation.annotations.medianLine.xMin = medianFreqA0;
                chartFFTA0.options.plugins.annotation.annotations.medianLine.xMax = medianFreqA0;
                document.getElementById('medianFreqA0').textContent = medianFreqA0.toFixed(2);
                chartFFTA0.data.datasets[0].data = fftDataA0;
                chartFFTA0.update('none');
            }
        }


        if (document.getElementById('channelA1Checkbox').checked) {
            dataA1.push({ x: currentTime, y: valueA1 });
            const rmsA1 = calculateRMS(dataA1, windowSize);
            envelopeA1.push({ x: currentTime, y: rmsA1 });

            if (dataA1.length % 100 === 0) {  // Actualizar FFT cada 100 muestras
                fftDataA1 = calculateFFT(dataA1);
                const medianFreqA1 = calculateMedianFrequency(fftDataA1);
                chartFFTA1.options.plugins.annotation.annotations.medianLine.xMin = medianFreqA1;
                chartFFTA1.options.plugins.annotation.annotations.medianLine.xMax = medianFreqA1;
                document.getElementById('medianFreqA1').textContent = medianFreqA1.toFixed(2);
                chartFFTA1.data.datasets[0].data = fftDataA1;
                chartFFTA1.update('none');
            }


        }




        // Mantener solo los últimos maxDataPoints
        if (dataA0.length > maxDataPoints) {
            dataA0.shift();
            envelopeA0.shift();
        }
        if (dataA1.length > maxDataPoints) {
            dataA1.shift();
            envelopeA1.shift();
        }

        // Actualizar los límites del eje x
        const newMin = Math.max(0, currentTime - maxTime);
        const newMax = currentTime;

        chartA0.options.scales.x.min = newMin;
        chartA0.options.scales.x.max = newMax;
        chartA1.options.scales.x.min = newMin;
        chartA1.options.scales.x.max = newMax;

        chartA0.update('none');
        chartA1.update('none');
    });
});

function startDataCollection() {
    isRunning = true;
    startTime = Date.now();
    dataA0 = [];
    dataA1 = [];
    envelopeA0 = [];
    envelopeA1 = [];
}

function stopDataCollection() {
    isRunning = false;
}