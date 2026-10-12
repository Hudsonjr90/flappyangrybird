var debugmode = false;

var states = Object.freeze({
   SplashScreen: 0,
   GameScreen: 1,
   ScoreScreen: 2
});

var currentstate;

var gravity = 0.25;
var velocity = 0;
var position = 180;
var rotation = 0;
var jump = -4.6;
var flyArea = 420;

var score = 0;
var highscore = 0;

var pipeheight = 90;
var pipewidth = 52;
var pipes = new Array();

var replayclickable = false;

// Cached DOM references and a single frame-synchronized game loop.
var playerElement = document.getElementById("player");
var flyareaElement = document.getElementById("flyarea");
var landElement = document.getElementById("land");
var ceilingElement = document.getElementById("ceiling");
var playerBoxElement = document.getElementById("playerbox");
var pipeBoxElement = document.getElementById("pipebox");
var gameFrameId = null;
var lastFrameTimestamp = 0;
var pipeSpawnElapsed = 0;
var PIPE_SPAWN_INTERVAL = 1400;
var FRAME_DURATION = 1000 / 60;
var MAX_FRAME_DELTA = 34;

//sounds
var volume = 30;
var soundJump = new buzz.sound("assets/sounds/sfx_wing.wav");
var soundScore = new buzz.sound("assets/sounds/sfx_point.wav");
var soundHit = new buzz.sound("assets/sounds/sfx_hit.wav");
var soundDie = new buzz.sound("assets/sounds/sfx_die.wav");
var soundSwoosh = new buzz.sound("assets/sounds/sfx_swooshing.wav");
buzz.all().setVolume(volume);

//loops
var loopGameloop;
var loopPipeloop;
var ezMode = false;
var ezBtn = document.querySelector("#ezbtn");

ezBtn.addEventListener("click", function(){
   if(!ezMode){
      ezBtn.innerText = "Modo Fácil Ativado";
      pipeheight = 200;
   }else{
      ezBtn.innerText = "Modo Difícil Ativado";
      pipeheight = 90;
      
   }
   ezMode = !ezMode;

});



$(document).ready(function() {
   if(window.location.search == "?debug")
      debugmode = true;
   if(window.location.search == "?easy&mode=full"){
	   pipeheight = 200;
	   
		
	   
   }
      

   //get the highscore
   var savedscore = getCookie("highscore");
   if(savedscore != "")
      highscore = parseInt(savedscore);

   //start with the splash screen
   showSplash();
});

function getCookie(cname)
{
   var name = cname + "=";
   var ca = document.cookie.split(';');
   for(var i=0; i<ca.length; i++)
   {
      var c = ca[i].trim();
      if (c.indexOf(name)==0) return c.substring(name.length,c.length);
   }
   return "";
}

function setCookie(cname,cvalue,exdays)
{
   var d = new Date();
   d.setTime(d.getTime()+(exdays*24*60*60*1000));
   var expires = "expires="+d.toGMTString();
   document.cookie = cname + "=" + cvalue + "; " + expires;
}

function showSplash()
{
   currentstate = states.SplashScreen;

   //set the defaults (again)
   velocity = 0;
   position = 180;
   rotation = 0;
   score = 0;

   //update the player in preparation for the next game
   if (gameFrameId !== null) {
      cancelAnimationFrame(gameFrameId);
      gameFrameId = null;
   }
   lastFrameTimestamp = 0;
   pipeSpawnElapsed = 0;
   playerElement.style.transition = "";
   playerElement.style.top = "0px";
   playerElement.style.transform = "translate3d(0, " + position + "px, 0) rotate(0deg)";
   updatePlayer();

   soundSwoosh.stop();
   soundSwoosh.play();

   //clear out all the pipes if there are any
   $(".pipe").remove();
   pipes = new Array();

   //make everything animated again
   $(".animated").css('animation-play-state', 'running');
   $(".animated").css('-webkit-animation-play-state', 'running');

   //fade in the splash
   $("#splash").transition({ opacity: 1 }, 2000, 'ease');
}

function startGame()
{
   if (currentstate === states.GameScreen) return;
   currentstate = states.GameScreen;
   $("#splash").stop().transition({ opacity: 0 }, 300, 'ease');
   setBigScore();
   if (debugmode) $(".boundingbox").show();
   lastFrameTimestamp = 0;
   pipeSpawnElapsed = 0;
   playerJump();
   gameFrameId = requestAnimationFrame(gameloop);
}

function updatePlayer()
{
   rotation = Math.min((velocity / 10) * 90, 90);
   // Transform-only movement avoids a layout recalculation from changing CSS top every frame.
   playerElement.style.transform = "translate3d(0, " + position + "px, 0) rotate(" + rotation + "deg)";
}

function gameloop(timestamp)
{
   if (currentstate !== states.GameScreen) {
      gameFrameId = null;
      return;
   }
   if (!lastFrameTimestamp) lastFrameTimestamp = timestamp;
   var deltaMs = Math.min(timestamp - lastFrameTimestamp, MAX_FRAME_DELTA);
   lastFrameTimestamp = timestamp;
   var frameScale = deltaMs / FRAME_DURATION;

   // Scale the original physics to elapsed time for consistent motion across refresh rates.
   velocity += gravity * frameScale;
   position += velocity * frameScale;
   updatePlayer();

   var box = playerElement.getBoundingClientRect();
   var origwidth = 34.0;
   var origheight = 24.0;
   var boxwidth = origwidth - (Math.sin(Math.abs(rotation) / 90) * 8);
   var boxheight = (origheight + box.height) / 2;
   var boxleft = ((box.width - boxwidth) / 2) + box.left;
   var boxtop = ((box.height - boxheight) / 2) + box.top;
   var boxright = boxleft + boxwidth;
   var boxbottom = boxtop + boxheight;

   if (debugmode) {
      playerBoxElement.style.left = boxleft + "px";
      playerBoxElement.style.top = boxtop + "px";
      playerBoxElement.style.height = boxheight + "px";
      playerBoxElement.style.width = boxwidth + "px";
   }

   if (box.bottom >= landElement.getBoundingClientRect().top) {
      playerDead();
      return;
   }
   if (boxtop <= ceilingElement.getBoundingClientRect().bottom) position = 0;

   // Use elapsed time rather than a second setInterval for obstacle spawning.
   pipeSpawnElapsed += deltaMs;
   if (pipeSpawnElapsed >= PIPE_SPAWN_INTERVAL) {
      pipeSpawnElapsed -= PIPE_SPAWN_INTERVAL;
      updatePipes();
   }

   if (pipes.length > 0) {
      var nextpipe = pipes[0];
      var nextpipeupper = nextpipe[0].querySelector(".pipe_upper");
      if (nextpipeupper) {
         var pipeRect = nextpipeupper.getBoundingClientRect();
         var pipetop = pipeRect.bottom;
         var pipeleft = pipeRect.left - 2;
         var piperight = pipeleft + pipewidth;
         var pipebottom = pipetop + pipeheight;

         if (debugmode) {
            pipeBoxElement.style.left = pipeleft + "px";
            pipeBoxElement.style.top = pipetop + "px";
            pipeBoxElement.style.height = pipeheight + "px";
            pipeBoxElement.style.width = pipewidth + "px";
         }
         if (boxright > pipeleft && !(boxtop > pipetop && boxbottom < pipebottom)) {
            playerDead();
            return;
         }
         if (boxleft > piperight) {
            pipes.splice(0, 1);
            playerScore();
         }
      }
   }
   gameFrameId = requestAnimationFrame(gameloop);
}

//Handle space bar
$(document).keydown(function(e){
   //space bar!
   if(e.keyCode == 32)
   {
      //in ScoreScreen, hitting space should click the "replay" button. else it's just a regular spacebar hit
      if(currentstate == states.ScoreScreen)
         $("#replay").click();
      else
         screenClick();
   }
});

// Pointer Events unify touch, pen and mouse; prevent browser gestures over the playfield.
var gameScreenElement = document.getElementById("gamescreen");
if (gameScreenElement) gameScreenElement.style.touchAction = "none";
function handleGamePointer(event) {
   if (event.target && event.target.closest && event.target.closest("#replay, #footer, a, button")) return;
   if (event.cancelable) event.preventDefault();
   screenClick();
}
if (window.PointerEvent) {
   document.addEventListener("pointerdown", function(event) {
      if (gameScreenElement && gameScreenElement.contains(event.target)) handleGamePointer(event);
   }, { passive: false });
} else if ("ontouchstart" in window) {
   document.addEventListener("touchstart", function(event) {
      if (gameScreenElement && gameScreenElement.contains(event.target)) handleGamePointer(event);
   }, { passive: false });
} else {
   document.addEventListener("mousedown", function(event) {
      if (gameScreenElement && gameScreenElement.contains(event.target)) handleGamePointer(event);
   });
}

function screenClick()
{
   if(currentstate == states.GameScreen)
   {
      playerJump();
   }
   else if(currentstate == states.SplashScreen)
   {
      startGame();
   }
}

function playerJump()
{
   velocity = jump;
   //play jump sound
   soundJump.stop();
   soundJump.play();
}

function setBigScore(erase)
{
   var elemscore = $("#bigscore");
   elemscore.empty();

   if(erase)
      return;

   var digits = score.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='assets/font_big_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setSmallScore()
{
   var elemscore = $("#currentscore");
   elemscore.empty();

   var digits = score.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='assets/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setHighScore()
{
   var elemscore = $("#highscore");
   elemscore.empty();

   var digits = highscore.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='assets/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setMedal()
{
   var elemmedal = $("#medal");
   elemmedal.empty();

   if(score < 10)
      //signal that no medal has been won
      return false;

   if(score >= 10)
      medal = "bronze";
   if(score >= 20)
      medal = "silver";
   if(score >= 30)
      medal = "gold";
   if(score >= 40)
      medal = "platinum";

   elemmedal.append('<img src="assets/medal_' + medal +'.png" alt="' + medal +'">');

   //signal that a medal has been won
   return true;
}

function playerDead()
{
   //stop animating everything!
   $(".animated").css('animation-play-state', 'paused');
   $(".animated").css('-webkit-animation-play-state', 'paused');

   // Stop the single animation loop before the death transition.
   if (gameFrameId !== null) cancelAnimationFrame(gameFrameId);
   gameFrameId = null;
   var playerbottom = position + playerElement.offsetWidth;
   var movey = Math.max(0, flyArea - playerbottom);
   playerElement.style.transition = "transform 1000ms cubic-bezier(0.65, 0, 0.35, 1)";
   playerElement.style.transform = "translate3d(0, " + (position + movey) + "px, 0) rotate(90deg)";

   //it's time to change states. as of now we're considered ScoreScreen to disable left click/flying
   currentstate = states.ScoreScreen;

   //destroy our gameloops
   clearInterval(loopGameloop);
   clearInterval(loopPipeloop);
   loopGameloop = null;
   loopPipeloop = null;

   //mobile browsers don't support buzz bindOnce event
   if(isIncompatible.any())
   {
      //skip right to showing score
      showScore();
   }
   else
   {
      //play the hit sound (then the dead sound) and then show score
      soundHit.play().bindOnce("ended", function() {
         soundDie.play().bindOnce("ended", function() {
            showScore();
         });
      });
   }
}

function showScore()
{
   //unhide us
   $("#scoreboard").css("display", "block");

   //remove the big score
   setBigScore(true);

   //have they beaten their high score?
   if(score > highscore)
   {
      //yeah!
      highscore = score;
      //save it!
      setCookie("highscore", highscore, 999);
   }

   //update the scoreboard
   setSmallScore();
   setHighScore();
   var wonmedal = setMedal();

   //SWOOSH!
   soundSwoosh.stop();
   soundSwoosh.play();

   //show the scoreboard
   $("#scoreboard").css({ y: '40px', opacity: 0 }); //move it down so we can slide it up
   $("#replay").css({ y: '40px', opacity: 0 });
   $("#scoreboard").transition({ y: '0px', opacity: 1}, 300, 'ease', function() {
      //When the animation is done, animate in the replay button and SWOOSH!
      soundSwoosh.stop();
      soundSwoosh.play();
      $("#replay").transition({ y: '0px', opacity: 1}, 300, 'ease');
		$("#sharebox").transition({ y: '0px', opacity: 1}, 300, 'ease');
		$("#sharebox").css("display", "block");
      //also animate in the MEDAL! WOO!
      if(wonmedal)
      {
         $("#medal").css({ scale: 2, opacity: 0 });
         $("#medal").transition({ opacity: 1, scale: 1 }, 600, 'ease');
      }
   });

   //make the replay button clickable
   replayclickable = true;
}

$("#replay").click(function() {
	$("#sharebox").transition({ y: '0px', opacity: 0}, 300, 'ease');
	$("#sharebox").css("display", "none");
   //make sure we can only click once
   if(!replayclickable)
      return;
   else
      replayclickable = false;
   //SWOOSH!
   soundSwoosh.stop();
   soundSwoosh.play();

   //fade out the scoreboard
   $("#scoreboard").transition({ y: '-40px', opacity: 0}, 1000, 'ease', function() {
      //when that's done, display us back to nothing
      $("#scoreboard").css("display", "none");

      //start the game over!
      showSplash();
   });
});

function playerScore()
{
   score += 1;
   //play score sound
   soundScore.stop();
   soundScore.play();
   setBigScore();
}

function updatePipes()
{
   // Clean up off-screen pipes only when spawning a new one, not every frame.
   var flyareaLeft = flyareaElement.getBoundingClientRect().left;
   $(".pipe").filter(function() {
      return this.getBoundingClientRect().right <= flyareaLeft + 100;
   }).remove();




   //add a new pipe (top height + bottom height  + pipeheight == flyArea) and put it in our tracker
   var padding = 80;
   var constraint = flyArea - pipeheight - (padding * 2); //double padding (for top and bottom)
   var topheight = Math.floor((Math.random()*constraint) + padding); //add lower padding
   var bottomheight = (flyArea - pipeheight) - topheight;
   var newpipe = $('<div class="pipe animated"><div class="pipe_upper" style="height: ' + topheight + 'px;"></div><div class="pipe_lower" style="height: ' + bottomheight + 'px;"></div></div>');
   $(flyareaElement).append(newpipe);
   pipes.push(newpipe);
}

var isIncompatible = {
   Android: function() {
   return navigator.userAgent.match(/Android/i);
   },
   BlackBerry: function() {
   return navigator.userAgent.match(/BlackBerry/i);
   },
   iOS: function() {
   return navigator.userAgent.match(/iPhone|iPad|iPod/i);
   },
   Opera: function() {
   return navigator.userAgent.match(/Opera Mini/i);
   },
   Safari: function() {
   return (navigator.userAgent.match(/OS X.*Safari/) && ! navigator.userAgent.match(/Chrome/));
   },
   Windows: function() {
   return navigator.userAgent.match(/IEMobile/i);
   },
   any: function() {
   return (isIncompatible.Android() || isIncompatible.BlackBerry() || isIncompatible.iOS() || isIncompatible.Opera() || isIncompatible.Safari() || isIncompatible.Windows());
   }
};

//Mute button
let muteSound = localStorage.getItem("mutesound");
let btnMute = document.getElementById("mute");
let btnHide = document.getElementById("hide");

if(muteSound == null){
   localStorage.setItem("mutesound", false);
}

function soundSet(){
   let checkMute = localStorage.getItem("mutesound");
   buzz.all().setVolume(30);
   if(checkMute == "false"){
      buzz.all().setVolume(30);
   }else{
      buzz.all().setVolume(0);
   }

}
soundSet();
btnMute.addEventListener('click', function(){

   //console.log(muteSound);
   muteSound = !muteSound;
   localStorage.setItem("mutesound", muteSound);
   soundSet();

});


btnHide.addEventListener('click', function(){

   document.getElementById("footer").innerHTML = "";

});



$(window).resize(function(){
 
   var width = $(window).width();
   let value = (width - 328)/2;
   $('.cover').width(value)
  
});
