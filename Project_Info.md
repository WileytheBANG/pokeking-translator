# Author: WileytheBang [Discord name: Nhien An]
*(Warning: This is just me rambling!)*
## 1. Background

Not long ago, I found myself bored of using the same old "Reckless Man" team in the Elite 4 rerun. I needed something fresh to keep me engaged—not just with the game, but also with the community. That’s when I stumbled upon the **Pokeking** page, a treasure trove of team comps and creative tech strategies used to conquer the Elite 4.

But of course, there was one glaring problem: the **language barrier**.

Sure, most modern browsers offer a built-in translation function, but unfortunately, it just doesn’t work well in this case. The translations are either funny, too literal, or just plain confusing. You can see some examples of that mess below...
![image](https://github.com/user-attachments/assets/20d4f770-5dac-4e34-8813-ec8b0bc7cc2e)
>Perry the platypus, that can fire flame at you.(Magmorta)<br/>
>Hudi, the great saint with infinity IQ (Alakazam)
## 2. The First Problem

To really explore what Pokeking had to offer, I figured I’d try building a **custom translator** Model tailored specifically for Pokémon-related content. My first idea was to create an AI model that could translate everything into my native language. 

Sounds cool, right?

Well, it turned out to be a logistical nightmare. Copy-pasting content from Pokeking into an AI translator while simultaneously executing those strategies in-game? Not practical at all. So, I shelved that idea. The AI model still exists in my ChatGPT paid account… collecting digital dust.
![image](https://github.com/user-attachments/assets/a63f436a-f17e-4fc8-9286-469c6c27a876)
>Le multitasking
## 3. The Perfect Solution

Then a better idea hit me.

If copying and pasting is too much hassle, why not just **read translations directly on the webpage** itself? I already knew browser extensions could modify page content, so I dove into learning JavaScript, HTML, and browser extension development.

It was my first real foray into coding—but surprisingly, the experiment worked. And it worked so well, I felt it would be selfish to keep it to myself. So, I created this repository to share the experience with others.

After launching version 1 of the extension, the community responded with encouragement and suggestions to improve the tool even further. With help from AI and my newly gained knowledge, I rolled out **version 2**, which auto-translates content instead of clicking the extension manually.

That said, the dictionary I used captured around 80% of the content accurately. But some rogue Chinese characters still popped up here and there—proof that the translation wasn’t perfect yet. As more users tried the extension, more issues emerged: random bugs, overlapping dictionary entries, occasional crashes.

But the biggest challenge? **Mobile support.**

Many players play the game from their phones, and they wanted to read the solve naturally as the team Pory's page did. As a self-taught developer who learned JavaScript in just one week, I really struggled to come up with a solution.
![image](https://github.com/user-attachments/assets/3a14cea1-bc83-4195-93c5-958ea64ccde9)
>Thank you FreeReign for raising my awareness of mobile players. :ok_man:

## 4. The Unexpected Guest

And then came the hero of our story—**Wilson**. @compscimmo

He reached out with a forked version of my repo. Not only did he upgrade the UI, but he also expanded the dictionary and managed to clean up those leftover Chinese characters. And perhaps most importantly (or so he joked), he gave the extension **the icon**.

But Wilson didn’t stop there. He even created a config file that allowed the extension to run on **Firefox Mobile**. We teamed up to squash a few more bugs, and with that, **version 3** was born—now supporting mobile browsers!
![image](https://github.com/user-attachments/assets/8d587b55-0f1f-403a-aff2-2ef5008cb9cd)
>Same page, different feeling.
## 5. Future Development

After some discussions on where to go next, we decided to involve the community directly. We’ve opened a shared sheet where users can **report errors** and issues. Once reviewed, we’ll incorporate those updates into the main dictionary used by the extension.

Together, we’re building something better—bit by bit, update by update. Stay tuned!
