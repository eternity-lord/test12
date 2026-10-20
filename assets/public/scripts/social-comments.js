(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SocialComments = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Authored background comments are content, not save data. Image keys keep
  // old saves, outfit branches and Mason variants on the same visible photo.
  const entries = [
    { app: "onlyfun", image: "assets/pictures/evidence/evelyn_d15_comment.jpg", comments: [
      {"id":"baseline:evelyn_d15_comment.jpg:1","author":"night.owl","text":"Was just about to log off. Glad I checked the feed."},
      {"id":"baseline:evelyn_d15_comment.jpg:2","author":"amber.afterhours","text":"A late-night update! Worth staying up for."},
      {"id":"baseline:evelyn_d15_comment.jpg:3","author":"vinyl.mood","text":"What was playing in the background?"},
      {"id":"baseline:evelyn_d15_comment.jpg:4","author":"milo.nights","text":"This account never sticks to my sleep schedule."},
      {"id":"baseline:evelyn_d15_comment.jpg:5","author":"clara.moon","text":"Hope you got some rest after that shift."}
    ] },
    { app: "snapgram", image: "assets/pictures/Snapgram/d2_aiden_friends_post.jpg", comments: [
      {"id":"baseline:d2_aiden_friends_post.jpg:1","author":"jake.miles","text":"You two look like trouble."},
      {"id":"baseline:d2_aiden_friends_post.jpg:2","author":"rina_07","text":"Track selfie of the week. The red jacket is doing all the work."},
      {"id":"baseline:d2_aiden_friends_post.jpg:3","author":"coach_ben","text":"At least one of you is smiling like you actually won something."},
      {"id":"baseline:d2_aiden_friends_post.jpg:4","author":"tess.lane","text":"Brotherhood pic. I’d hang this on a fridge unironically."},
      {"id":"baseline:d2_aiden_friends_post.jpg:5","author":"omar.k","text":"Camera that close and nobody blinked. Respect."}
    ] },
    { app: "snapgram", image: "assets/pictures/Snapgram/hailey_exam_finished.jpg", comments: [
      {"id":"baseline:hailey_exam_finished.jpg:1","author":"mira.notes","text":"Exam face unlocked. Congrats."},
      {"id":"baseline:hailey_exam_finished.jpg:2","author":"theo_k","text":"You look wrecked in the best way. That’s a “I never want to see a textbook again” smile."},
      {"id":"baseline:hailey_exam_finished.jpg:3","author":"parkside.jen","text":"Friends in the back made this better."},
      {"id":"baseline:hailey_exam_finished.jpg:4","author":"sami.bell","text":"Ponytail, coffee, street. Post-exam uniform complete."},
      {"id":"baseline:hailey_exam_finished.jpg:5","author":"hugo.r","text":"Tell me you passed without telling me you passed."},
      {"id":"baseline:hailey_exam_finished.jpg:6","author":"nida.sun","text":"I can feel the relief through the screen."}
    ] },
    { app: "snapgram", image: "assets/pictures/Snapgram/hailey_post_d19.jpg", comments: [
      {"id":"baseline:hailey_post_d19.jpg:1","author":"lina.vee","text":"You two are too close for a “casual” pic."},
      {"id":"baseline:hailey_post_d19.jpg:2","author":"noah_park","text":"Outdoor light loves you."},
      {"id":"baseline:hailey_post_d19.jpg:3","author":"sasha.m","text":"Matching energy. Dangerous."},
      {"id":"baseline:hailey_post_d19.jpg:4","author":"eliot.f","text":"The way she’s leaning in… that’s not just a friend pose and I’m not taking questions."},
      {"id":"baseline:hailey_post_d19.jpg:5","author":"priya.n","text":"Pink shorts vs black top. Styling accidental? Don’t care. It works."}
    ] },
    { app: "snapgram", image: "assets/pictures/Snapgram/hailey_post_day1.jpg", comments: [
      {"id":"baseline:hailey_post_day1.jpg:1","author":"club.ryan","text":"That selfie is doing numbers."},
      {"id":"baseline:hailey_post_day1.jpg:2","author":"ellie_night","text":"Hair, lighting, done."},
      {"id":"baseline:hailey_post_day1.jpg:3","author":"kai.wav","text":"First night energy. Keep it."},
      {"id":"baseline:hailey_post_day1.jpg:4","author":"val.rose","text":"Club selfies usually look messy. This one looks expensive."},
      {"id":"baseline:hailey_post_day1.jpg:5","author":"jon.marks","text":"Somebody held the phone like they meant it."},
      {"id":"baseline:hailey_post_day1.jpg:6","author":"chloe.d","text":"I want the song that was playing."}
    ] },
    { app: "snapgram", image: "assets/pictures/Snapgram/hailey_story_d19.jpg", comments: [
      {"id":"baseline:hailey_story_d19.jpg:1","author":"mallory.b","text":"Trio look locked in."},
      {"id":"baseline:hailey_story_d19.jpg:2","author":"jun_takes","text":"Who planned the outfits, because it worked."},
      {"id":"baseline:hailey_story_d19.jpg:3","author":"iris.sun","text":"This is a whole mood."},
      {"id":"baseline:hailey_story_d19.jpg:4","author":"benny.k","text":"Mall lighting is usually ugly and you three still look like a poster."},
      {"id":"baseline:hailey_story_d19.jpg:5","author":"ada.well","text":"Center one is carrying the composition and she knows it."}
    ] },
    { app: "snapgram", image: "assets/pictures/Snapgram/hailey_story_day1.jpg", comments: [
      {"id":"baseline:hailey_story_day1.jpg:1","author":"becks","text":"Soft and a little too intimate. I like it."},
      {"id":"baseline:hailey_story_day1.jpg:2","author":"dara_film","text":"Faces this close should be illegal."},
      {"id":"baseline:hailey_story_day1.jpg:3","author":"owen.t","text":"You both look actually happy, not “posing for happy.”"},
      {"id":"baseline:hailey_story_day1.jpg:4","author":"mae.lin","text":"Forehead to forehead is a choice and I’m supporting it."},
      {"id":"baseline:hailey_story_day1.jpg:5","author":"ravi.s","text":"Save a copy before the algorithm buries it."}
    ] },
    { app: "snapgram", image: "assets/pictures/Snapgram/hailey_story_mirror_d18.jpg", comments: [
      {"id":"baseline:hailey_story_mirror_d18.jpg:1","author":"fit.nina","text":"Mirror check passed."},
      {"id":"baseline:hailey_story_mirror_d18.jpg:2","author":"leo_city","text":"Those shorts are doing the work."},
      {"id":"baseline:hailey_story_mirror_d18.jpg:3","author":"amber.q","text":"Phone up, smirk on. Classic."},
      {"id":"baseline:hailey_story_mirror_d18.jpg:4","author":"skye.p","text":"Hallway mirror + black tights is a whole personality."},
      {"id":"baseline:hailey_story_mirror_d18.jpg:5","author":"gareth.m","text":"You took this knowing exactly what the comments would be."},
      {"id":"baseline:hailey_story_mirror_d18.jpg:6","author":"june.halo","text":"Clean shot. Don’t crop the shoes next time, they finish it."}
    ] },
    { app: "snapgram", image: "assets/pictures/Snapgram/hailey_story_morning_d19.jpg", comments: [
      {"id":"baseline:hailey_story_morning_d19.jpg:1","author":"sunday.mae","text":"Park bench mornings hit different."},
      {"id":"baseline:hailey_story_morning_d19.jpg:2","author":"cole_walks","text":"Soft pic. Don’t ruin it with a caption."},
      {"id":"baseline:hailey_story_morning_d19.jpg:3","author":"yuki.n","text":"Ponytail + sun. Clean."},
      {"id":"baseline:hailey_story_morning_d19.jpg:4","author":"harriet.b","text":"White top, denim, trees behind. Looks like the first warm day of the year."},
      {"id":"baseline:hailey_story_morning_d19.jpg:5","author":"felix.o","text":"Sitting like she has nowhere to be. Jealous."}
    ] },
    { app: "snapgram", image: "assets/pictures/Snapgram/hailey_tutor_sitting.jpg", comments: [
      {"id":"baseline:hailey_tutor_sitting.jpg:1","author":"study.tom","text":"That’s not studying."},
      {"id":"baseline:hailey_tutor_sitting.jpg:2","author":"helen_r","text":"Floor seating is a choice."},
      {"id":"baseline:hailey_tutor_sitting.jpg:3","author":"marc.desk","text":"Bedroom office. Respectfully chaotic."},
      {"id":"baseline:hailey_tutor_sitting.jpg:4","author":"ivia.k","text":"Laptop on the floor, bed made, posters on the wall. This is a whole short film."},
      {"id":"baseline:hailey_tutor_sitting.jpg:5","author":"paul.n","text":"If the tutor session looks like this I need a new major."}
    ] },
    { app: "snapgram", image: "assets/pictures/Snapgram/mason_fitness_first_female_post.jpg", comments: [
      {"id":"baseline:mason_fitness_first_female_post.jpg:1","author":"gym.ivy","text":"First post and you’re already flexing like that."},
      {"id":"baseline:mason_fitness_first_female_post.jpg:2","author":"brad_lifts","text":"Quads speaking."},
      {"id":"baseline:mason_fitness_first_female_post.jpg:3","author":"nori.sweat","text":"Gym lighting understood the assignment."},
      {"id":"baseline:mason_fitness_first_female_post.jpg:4","author":"cass.form","text":"The shorts plus that stance is why people suddenly “start lifting.”"},
      {"id":"baseline:mason_fitness_first_female_post.jpg:5","author":"derek.h","text":"Please post the program or I’ll invent a worse one."},
      {"id":"baseline:mason_fitness_first_female_post.jpg:6","author":"lina.rep","text":"Strong looks good on you. Keep going."}
    ] },
    { app: "snapgram", image: "assets/pictures/Snapgram/mason_fitness_first_post.jpg", comments: [
      {"id":"baseline:mason_fitness_first_post.jpg:1","author":"spotter.jay","text":"Clean pose."},
      {"id":"baseline:mason_fitness_first_post.jpg:2","author":"rika_fit","text":"Okay then."},
      {"id":"baseline:mason_fitness_first_post.jpg:3","author":"dustin.k","text":"Don’t skip leg day energy."},
      {"id":"baseline:mason_fitness_first_post.jpg:4","author":"mira.iron","text":"Same gym, same light, different story. Both work."},
      {"id":"baseline:mason_fitness_first_post.jpg:5","author":"owen.bar","text":"First fitness post and it already looks like month six."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/alphamana_day12_ntr.jpg", comments: [
      {"id":"baseline:alphamana_day12_ntr.jpg:1","author":"office.vin","text":"That skirt from behind is a problem."},
      {"id":"baseline:alphamana_day12_ntr.jpg:2","author":"claire.w","text":"She knows the camera’s there."},
      {"id":"baseline:alphamana_day12_ntr.jpg:3","author":"rex_nights","text":"Work clothes shouldn’t look like that."},
      {"id":"baseline:alphamana_day12_ntr.jpg:4","author":"hana.desk","text":"Hands on the desk, back arched just enough. That’s not “reaching for a file.”"},
      {"id":"baseline:alphamana_day12_ntr.jpg:5","author":"colt.b","text":"If this is the office I would never hit a deadline again."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/alphamana_day13_ntr.jpg", comments: [
      {"id":"baseline:alphamana_day13_ntr.jpg:1","author":"window.lux","text":"Blouse + daylight. Unfair."},
      {"id":"baseline:alphamana_day13_ntr.jpg:2","author":"seth.m","text":"Hands on the table like she’s innocent."},
      {"id":"baseline:alphamana_day13_ntr.jpg:3","author":"nina.vale","text":"I would fail that meeting."},
      {"id":"baseline:alphamana_day13_ntr.jpg:4","author":"aria.gold","text":"The window light on that shirt is doing things the photographer should be paid extra for."},
      {"id":"baseline:alphamana_day13_ntr.jpg:5","author":"jonah.r","text":"Soft pose, zero innocence. I see you."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/alphamana_day14_ntr.jpg", comments: [
      {"id":"baseline:alphamana_day14_ntr.jpg:1","author":"barstool.j","text":"Leaning over like she doesn’t know."},
      {"id":"baseline:alphamana_day14_ntr.jpg:2","author":"kira_afterhours","text":"Neckline is the caption."},
      {"id":"baseline:alphamana_day14_ntr.jpg:3","author":"tom.h","text":"Somebody’s not working."},
      {"id":"baseline:alphamana_day14_ntr.jpg:4","author":"elise.m","text":"Papers in hand as if that’s what anyone’s looking at."},
      {"id":"baseline:alphamana_day14_ntr.jpg:5","author":"vito.n","text":"If the boss walked in this would still be worth it."},
      {"id":"baseline:alphamana_day14_ntr.jpg:6","author":"pearl.k","text":"That lean is practiced. Don’t insult me."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/alphamana_day15_ntr.jpg", comments: [
      {"id":"baseline:alphamana_day15_ntr.jpg:1","author":"lap.day","text":"That’s not a professional sit."},
      {"id":"baseline:alphamana_day15_ntr.jpg:2","author":"eva.noir","text":"Tie and thighs. I’m unwell."},
      {"id":"baseline:alphamana_day15_ntr.jpg:3","author":"gil_81","text":"Who’s holding her like that."},
      {"id":"baseline:alphamana_day15_ntr.jpg:4","author":"soren.late","text":"Suit still on, her on his lap. Meeting adjourned."},
      {"id":"baseline:alphamana_day15_ntr.jpg:5","author":"willa.q","text":"The way she’s turned into him… that’s not a first time."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/evelyn_d14_comment.jpg", comments: [
      {"id":"baseline:evelyn_d14_comment.jpg:1","author":"backroom.cal","text":"Bar lighting on her back. Yeah."},
      {"id":"baseline:evelyn_d14_comment.jpg:2","author":"sienna.k","text":"Don’t pretend this is about the drink."},
      {"id":"baseline:evelyn_d14_comment.jpg:3","author":"mike_lastcall","text":"I need a better angle and also I don’t."},
      {"id":"baseline:evelyn_d14_comment.jpg:4","author":"rue.d","text":"Leather, low light, hair down her back. This is a warning label."},
      {"id":"baseline:evelyn_d14_comment.jpg:5","author":"anton.p","text":"If I sat at that bar I would tip like an idiot."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/evelyn_tits_comment.jpg", comments: [
      {"id":"baseline:evelyn_tits_comment.jpg:1","author":"direct.ash","text":"Shameless. Correct."},
      {"id":"baseline:evelyn_tits_comment.jpg:2","author":"lola.red","text":"Face says embarrassed, body doesn’t."},
      {"id":"baseline:evelyn_tits_comment.jpg:3","author":"perry_n","text":"Hands where they shouldn’t be. Keep going."},
      {"id":"baseline:evelyn_tits_comment.jpg:4","author":"nova.jay","text":"That look at the camera is half apology half dare and I chose dare."},
      {"id":"baseline:evelyn_tits_comment.jpg:5","author":"chris.vale","text":"I’m not even going to pretend I scrolled past this."},
      {"id":"baseline:evelyn_tits_comment.jpg:6","author":"kim.low","text":"Whoever took this knew exactly what they were doing."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/EvelynBarOutfit1Day6.png", comments: [
      {"id":"baseline:evelynbaroutfit1day6.png:1","author":"shift.mae","text":"Service with a view."},
      {"id":"baseline:evelynbaroutfit1day6.png:2","author":"dan_taps","text":"That’s not how you take an order."},
      {"id":"baseline:evelynbaroutfit1day6.png:3","author":"wren.bar","text":"Whole room can see her and she doesn’t care."},
      {"id":"baseline:evelynbaroutfit1day6.png:4","author":"ida.s","text":"Standing over the table like that should come with a cover charge."},
      {"id":"baseline:evelynbaroutfit1day6.png:5","author":"leo.pint","text":"I would forget my drink order on purpose."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/EvelynBarOutfit1Day7.png", comments: [
      {"id":"baseline:evelynbaroutfit1day7.png:1","author":"close.q","text":"Too close for coworkers."},
      {"id":"baseline:evelynbaroutfit1day7.png:2","author":"hannah.v","text":"His hand knows exactly where it is."},
      {"id":"baseline:evelynbaroutfit1day7.png:3","author":"otto_lastseat","text":"Blur her face all you want. We get it."},
      {"id":"baseline:evelynbaroutfit1day7.png:4","author":"mira.tap","text":"That’s not flirting. That’s already decided."},
      {"id":"baseline:evelynbaroutfit1day7.png:5","author":"ben.kerr","text":"Bar’s still open and they’re acting like last call was an hour ago."},
      {"id":"baseline:evelynbaroutfit1day7.png:6","author":"suki.n","text":"The way she’s looking up at him is going to live in my head."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/EvelynBarOutfit1Day8.png", comments: [
      {"id":"baseline:evelynbaroutfit1day8.png:1","author":"corner.jay","text":"Pressed against him like the shift’s over."},
      {"id":"baseline:evelynbaroutfit1day8.png:2","author":"rue.s","text":"Skirt vs. his thigh. Skirt lost."},
      {"id":"baseline:evelynbaroutfit1day8.png:3","author":"nick.pints","text":"I would tip badly and stay anyway."},
      {"id":"baseline:evelynbaroutfit1day8.png:4","author":"opal.r","text":"His hand on her chest and she’s not moving it. Story’s over, sit down."},
      {"id":"baseline:evelynbaroutfit1day8.png:5","author":"drew.lane","text":"If this is “just work” I’m a monk."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/EvelynBarOutfit2Day6.png", comments: [
      {"id":"baseline:evelynbaroutfit2day6.png:1","author":"aisle.kim","text":"Standing talk that is not just talk."},
      {"id":"baseline:evelynbaroutfit2day6.png:2","author":"fraser","text":"Hand on her back. Noted."},
      {"id":"baseline:evelynbaroutfit2day6.png:3","author":"bea.low","text":"Dress + that lean. Problem."},
      {"id":"baseline:evelynbaroutfit2day6.png:4","author":"colin.m","text":"They look like they arrived together and will leave together."},
      {"id":"baseline:evelynbaroutfit2day6.png:5","author":"yara.s","text":"Soft light, private conversation, public room. I see it."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/EvelynBarOutfit2Day7.png", comments: [
      {"id":"baseline:evelynbaroutfit2day7.png:1","author":"goldlight.r","text":"Soft light, hard intent."},
      {"id":"baseline:evelynbaroutfit2day7.png:2","author":"paulo.n","text":"That’s a date pose at work."},
      {"id":"baseline:evelynbaroutfit2day7.png:3","author":"mina.k","text":"She’s smiling like she already decided."},
      {"id":"baseline:evelynbaroutfit2day7.png:4","author":"edith.v","text":"Arm around her like the rest of the bar doesn’t exist."},
      {"id":"baseline:evelynbaroutfit2day7.png:5","author":"jo.rex","text":"I need the audio and I also know I couldn’t handle the audio."},
      {"id":"baseline:evelynbaroutfit2day7.png:6","author":"niall.b","text":"Stop looking at the drink. Nobody else is."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/EvelynBarOutfit2Day8.png", comments: [
      {"id":"baseline:evelynbaroutfit2day8.png:1","author":"stool.end","text":"Against the bar, on purpose."},
      {"id":"baseline:evelynbaroutfit2day8.png:2","author":"ivy.drinks","text":"Skirt riding up and nobody’s fixing it."},
      {"id":"baseline:evelynbaroutfit2day8.png:3","author":"cal.reyes","text":"I need the next frame."},
      {"id":"baseline:evelynbaroutfit2day8.png:4","author":"petra.l","text":"That’s a “we’re leaving in five minutes” stance."},
      {"id":"baseline:evelynbaroutfit2day8.png:5","author":"hugo.s","text":"If the bartender coughed they’d still not notice."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/EvelynBarOutfit3Day6.png", comments: [
      {"id":"baseline:evelynbaroutfit3day6.png:1","author":"floorview","text":"Whole restaurant watching."},
      {"id":"baseline:evelynbaroutfit3day6.png:2","author":"tara.b","text":"Waitress walk. Sure."},
      {"id":"baseline:evelynbaroutfit3day6.png:3","author":"ed.miles","text":"That’s a scene, not a shift."},
      {"id":"baseline:evelynbaroutfit3day6.png:4","author":"lina.hall","text":"Center of the room, back to us, and it still feels pointed."},
      {"id":"baseline:evelynbaroutfit3day6.png:5","author":"gabe.r","text":"Somebody at that table is not tasting their food."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/EvelynBarOutfit3Day7.png", comments: [
      {"id":"baseline:evelynbaroutfit3day7.png:1","author":"uniform.jo","text":"Name tag and that smile. Dangerous."},
      {"id":"baseline:evelynbaroutfit3day7.png:2","author":"lex.night","text":"His arm’s too comfortable."},
      {"id":"baseline:evelynbaroutfit3day7.png:3","author":"piper.s","text":"They look like they’ve done this before."},
      {"id":"baseline:evelynbaroutfit3day7.png:4","author":"amos.k","text":"Uniform + after-hours posture. I know how this ends."},
      {"id":"baseline:evelynbaroutfit3day7.png:5","author":"rena.d","text":"She’s leaning in like the next sentence isn’t about work."},
      {"id":"baseline:evelynbaroutfit3day7.png:6","author":"will.fowler","text":"Lucky bastard. That’s the comment. That’s all of it."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/EvelynBarOutfit3Day8.png", comments: [
      {"id":"baseline:evelynbaroutfit3day8.png:1","author":"alley.light","text":"Corner couple. Not subtle."},
      {"id":"baseline:evelynbaroutfit3day8.png:2","author":"nora.jay","text":"Hands on her waist like he owns the hour."},
      {"id":"baseline:evelynbaroutfit3day8.png:3","author":"vic_after","text":"If the bar’s still open, I don’t believe you."},
      {"id":"baseline:evelynbaroutfit3day8.png:4","author":"cleo.m","text":"Against him, smiling, no space left. Caption unnecessary."},
      {"id":"baseline:evelynbaroutfit3day8.png:5","author":"dax.p","text":"This is the last photo before they disappear for the night and we all know it."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/NeonRose1.png", comments: [
      {"id":"baseline:neonrose1.png:1","author":"sheet.theory","text":"Soft bed, no innocence left."},
      {"id":"baseline:neonrose1.png:2","author":"dahlia.x","text":"That’s a “don’t text me after” photo."},
      {"id":"baseline:neonrose1.png:3","author":"orin","text":"Lace and eye contact. I’m done."},
      {"id":"baseline:neonrose1.png:4","author":"vera.night","text":"The way she’s sitting on him looks comfortable. That’s the hottest part."},
      {"id":"baseline:neonrose1.png:5","author":"luc.a","text":"Warm room, open shirt, her looking at us like we’re interrupting. Fine. I’ll leave. I won’t."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/NeonRose2.png", comments: [
      {"id":"baseline:neonrose2.png:1","author":"top.seat","text":"She’s in charge and he’s grateful."},
      {"id":"baseline:neonrose2.png:2","author":"willa.moon","text":"On top looks good on her."},
      {"id":"baseline:neonrose2.png:3","author":"ken.r","text":"I would empty my savings for the rest."},
      {"id":"baseline:neonrose2.png:4","author":"fio.k","text":"Hands on her hips like he’s holding on, not directing. She set the pace."},
      {"id":"baseline:neonrose2.png:5","author":"brent.o","text":"If this is still called “a scene” I’m calling it a problem."},
      {"id":"baseline:neonrose2.png:6","author":"asha.v","text":"The look on her face is the whole story."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/NeonRose3.png", comments: [
      {"id":"baseline:neonrose3.png:1","author":"street.cas","text":"Casual selfie after that folder is evil."},
      {"id":"baseline:neonrose3.png:2","author":"june.p","text":"Jeans and a smirk like we didn’t see the other pics."},
      {"id":"baseline:neonrose3.png:3","author":"hal.v","text":"The contrast is the point."},
      {"id":"baseline:neonrose3.png:4","author":"rina.day","text":"Phone in hand, jacket open, “what pics?” energy. Girl."},
      {"id":"baseline:neonrose3.png:5","author":"otto.s","text":"Wholesome pose, filthy context. I respect the bit."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/random_day10.jpg", comments: [
      {"id":"baseline:random_day10.jpg:1","author":"pour.line","text":"She’s not looking at the drink."},
      {"id":"baseline:random_day10.jpg:2","author":"mara.blue","text":"Hair down, mouth busy. Yeah."},
      {"id":"baseline:random_day10.jpg:3","author":"sid.k","text":"Bar back room energy."},
      {"id":"baseline:random_day10.jpg:4","author":"nell.r","text":"That’s not a taste. That’s a performance and the bartender has a front row seat."},
      {"id":"baseline:random_day10.jpg:5","author":"pax.m","text":"I scrolled back. I’m not sorry."},
      {"id":"baseline:random_day10.jpg:6","author":"gia.low","text":"If the next photo isn’t worse I’ll be disappointed."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/random_day12.jpg", comments: [
      {"id":"baseline:random_day12.jpg:1","author":"counter.girl","text":"Back at the bar. Same problem."},
      {"id":"baseline:random_day12.jpg:2","author":"eli.nights","text":"Legs and low light. Keep it."},
      {"id":"baseline:random_day12.jpg:3","author":"tessa.r","text":"If that’s workwear I’m applying."},
      {"id":"baseline:random_day12.jpg:4","author":"ronan.b","text":"Standing there like the whole room is invited to look. Noted."},
      {"id":"baseline:random_day12.jpg:5","author":"mya.k","text":"Stockings, heels, back to us. You knew."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/Sexminator2.png", comments: [
      {"id":"baseline:sexminator2.png:1","author":"fold.me","text":"Yeah. That’s the one."},
      {"id":"baseline:sexminator2.png:2","author":"brick.a","text":"Face down. No notes."},
      {"id":"baseline:sexminator2.png:3","author":"lumen.x","text":"Whoever’s behind her is not playing."},
      {"id":"baseline:sexminator2.png:4","author":"cass.19","text":"I skipped breathing."},
      {"id":"baseline:sexminator2.png:5","author":"jord.v","text":"The way she’s taking it and still looking like she asked for this exact angle… I need to sit down."},
      {"id":"baseline:sexminator2.png:6","author":"eden.r","text":"Don’t crop. Don’t blur. Don’t be a coward."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/Sexminator4.png", comments: [
      {"id":"baseline:sexminator4.png:1","author":"prone.ok","text":"Sheets in her fists. She came."},
      {"id":"baseline:sexminator4.png:2","author":"dorian.v","text":"That arch is criminal."},
      {"id":"baseline:sexminator4.png:3","author":"peach.k","text":"More. Now."},
      {"id":"baseline:sexminator4.png:4","author":"sable.n","text":"Face in the pillow, hips up, his hands exactly where they should be. This is the post."},
      {"id":"baseline:sexminator4.png:5","author":"kit.hayes","text":"I opened this at the wrong hour of the morning and that’s on me."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/Velvet1.png", comments: [
      {"id":"baseline:velvet1.png:1","author":"goldroom","text":"They look glued together."},
      {"id":"baseline:velvet1.png:2","author":"iris.late","text":"Kiss like the camera’s an accident."},
      {"id":"baseline:velvet1.png:3","author":"bo.han","text":"Warm light, no space left between them."},
      {"id":"baseline:velvet1.png:4","author":"lena.gold","text":"Foreheads together, mouths busy, sheets already a mess. Yeah I’m staying for Velvet2."},
      {"id":"baseline:velvet1.png:5","author":"craig.t","text":"This doesn’t look posed. That’s why it hits."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/Velvet2.png", comments: [
      {"id":"baseline:velvet2.png:1","author":"straddle.v","text":"On top, lace, eye contact. Done."},
      {"id":"baseline:velvet2.png:2","author":"mya.s","text":"She’s looking at us on purpose."},
      {"id":"baseline:velvet2.png:3","author":"reed.low","text":"I need a minute and also the sequel."},
      {"id":"baseline:velvet2.png:4","author":"opal.night","text":"Sitting on him like she owns the room and the camera. She does."},
      {"id":"baseline:velvet2.png:5","author":"finn.d","text":"Lace bra, messy hair, that stare. I would ruin my whole evening over this."},
      {"id":"baseline:velvet2.png:6","author":"sage.b","text":"If Velvet3 is the “innocent” follow-up I’m going to laugh."}
    ] },
    { app: "onlyfun", image: "assets/pictures/OnlyFun/posts/Velvet3.png", comments: [
      {"id":"baseline:velvet3.png:1","author":"library.lie","text":"Book in hand like we didn’t see the rest."},
      {"id":"baseline:velvet3.png:2","author":"sofia.page","text":"Innocent pose after those two is funny."},
      {"id":"baseline:velvet3.png:3","author":"drew.c","text":"Glasses and a smirk. She knows."},
      {"id":"baseline:velvet3.png:4","author":"helen.ark","text":"Sweater, book, quiet chair. Context from the last two photos makes this filthy."},
      {"id":"baseline:velvet3.png:5","author":"nico.w","text":"“Just reading.” Sure. Close the book."}
    ] }
  ];
  function normalizeImage(value) {
    let image = String(value || "").trim().replace(/\\/g, "/");
    try { image = decodeURIComponent(image); } catch {}
    image = image.split(/[?#]/, 1)[0].toLowerCase();
    const start = image.indexOf("assets/pictures/");
    return start < 0 ? image.replace(/^\.\//, "") : image.slice(start);
  }
  const catalog = new Map();
  for (const entry of entries) {
    entry.comments.forEach(Object.freeze);
    Object.freeze(entry.comments);
    Object.freeze(entry);
    catalog.set(entry.app + ":" + normalizeImage(entry.image), entry.comments);
  }
  function getForPost(app, post = {}) {
    if (app !== "snapgram" && app !== "onlyfun") return [];
    const baseline = catalog.get(app + ":" + normalizeImage(post.image)) || [];
    const authored = Array.isArray(post.comments) ? post.comments : [];
    const result = [], ids = new Set(), signatures = new Set();
    for (const row of [...baseline, ...authored]) {
      if (!row || typeof row !== "object") continue;
      const author = String(row.author || row.authorName || row.user || row.authorId || "").trim();
      const text = String(row.text || "").trim();
      if (!author || !text) continue;
      const id = String(row.id || row.commentId || "");
      const signature = author + "\u0000" + text;
      if ((id && ids.has(id)) || signatures.has(signature)) continue;
      if (id) ids.add(id);
      signatures.add(signature);
      result.push({ id, author, text });
    }
    return result;
  }
  return Object.freeze({ entries: Object.freeze(entries), getForPost });
});
