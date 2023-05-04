export default function background(ctx) {
  const rand = function (min, max) {
    return Math.random() * (max - min) + min;
  };

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  window.addEventListener('resize', function () {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'lighter';
  });
  let backgroundColors = ['#32174d', '#32174d'];
  let colors = [
    ['#002aff', '#047bbb'],
    ['#0054ff', '#b100cd'],
    ['#4c00b0', '#873dcc'],
  ];
  let count = 20;
  let blur = [30, 70];
  let radius = [200, 250];

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'lighter';

  let grd = ctx.createLinearGradient(0, canvas.height, canvas.width, 0);
  grd.addColorStop(0, backgroundColors[0]);
  grd.addColorStop(1, backgroundColors[1]);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let items = [];

  while (count--) {
    let thisRadius = rand(radius[0], radius[1]);
    let thisBlur = rand(blur[0], blur[1]);
    let x = rand(-100, canvas.width + 100);
    let y = rand(-100, canvas.height + 100);
    let colorIndex = Math.floor(rand(0, 299) / 100);
    let colorOne = colors[colorIndex][0];
    let colorTwo = colors[colorIndex][1];

    ctx.beginPath();
    ctx.filter = `blur(${thisBlur}px)`;
    let grd = ctx.createLinearGradient(
      x - thisRadius / 2,
      y - thisRadius / 2,
      x + thisRadius,
      y + thisRadius,
    );

    grd.addColorStop(0, colorOne);
    grd.addColorStop(1, colorTwo);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.arc(x, y, thisRadius, 0, Math.PI * 1);
    ctx.closePath();

    let direction = [
      [50, 55, 20, 60, 25, 30, 35, 40, -50, -55, -20, -60, -25, -30, -35, -40],
    ];

    let randomIndex = Math.floor(Math.random() * direction.length);
    let randomIndex2 = Math.floor(Math.random() * direction.length);

    let randomNumber = direction[randomIndex][0];
    let randomNumber2 = direction[randomIndex2][0];

    let directionX = Math.round(rand(-15, randomNumber) / 60);
    let directionY = Math.round(rand(-15, randomNumber2) / 60);

    items.push({
      x: x,
      y: y,
      blur: thisBlur,
      radius: thisRadius,
      initialXDirection: directionX,
      initialYDirection: directionY,
      initialBlurDirection: directionX,
      colorOne: colorOne,
      colorTwo: colorTwo,
      gradient: [
        x - thisRadius / 2,
        y - thisRadius / 2,
        x + thisRadius,
        y + thisRadius,
      ],
    });
  }

  function changeCanvas(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let adjX = 2;
    let adjY = 2;
    let adjBlur = 1;
    items.forEach(function (item) {
      if (
        (item.x + item.initialXDirection * adjX >= canvas.width &&
          item.initialXDirection !== 0) ||
        (item.x + item.initialXDirection * adjX <= 0 &&
          item.initialXDirection !== 0)
      ) {
        item.initialXDirection = item.initialXDirection * -1;
      }
      if (
        (item.y + item.initialYDirection * adjY >= canvas.height &&
          item.initialYDirection !== 0) ||
        (item.y + item.initialYDirection * adjY <= 0 &&
          item.initialYDirection !== 0)
      ) {
        item.initialYDirection = item.initialYDirection * -1;
      }

      if (
        (item.blur + item.initialBlurDirection * adjBlur >= radius[1] &&
          item.initialBlurDirection !== 0) ||
        (item.blur + item.initialBlurDirection * adjBlur <= radius[0] &&
          item.initialBlurDirection !== 0)
      ) {
        item.initialBlurDirection *= -1;
      }

      item.x += item.initialXDirection * adjX;
      item.y += item.initialYDirection * adjY;
      item.blur += item.initialBlurDirection * adjBlur;
      ctx.beginPath();
      ctx.filter = `blur(${item.blur}px)`;
      let grd = ctx.createLinearGradient(
        item.gradient[0],
        item.gradient[1],
        item.gradient[2],
        item.gradient[3],
      );
      grd.addColorStop(0, item.colorOne);
      grd.addColorStop(1, item.colorTwo);
      ctx.fillStyle = grd;
      ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();
    });
    window.requestAnimationFrame(changeCanvas);
  }

  window.requestAnimationFrame(changeCanvas);
}
