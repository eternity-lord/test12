(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CalendarManifest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Story anchors: DAY8 Lena explicitly says Friday; DAY10 says Sunday;
  // DAY11 says Monday. Day 1 is therefore Friday, independent of the PC date.
  // New plans require their committed announcement. The already-booked island
  // trip is known from the opening premise. expectedText guards authoring drift.
  // An announced plan remains visible. Only an authored public confirmation
  // creates its separate activity; advancing time never confirms an event.
  // These notes describe scenes the player attends, never remote HAK scenes.
  function freezeOccurrence(anchor) {
    return Object.freeze({...anchor,
      ...(anchor.branchPath ? {branchPath: Object.freeze(anchor.branchPath)} : {}),
      ...(anchor.requiredAnnouncements ? {requiredAnnouncements: Object.freeze(anchor.requiredAnnouncements.map(freezeOccurrence))} : {})});
  }
  const occurredBy = Object.freeze(Object.fromEntries(Object.entries({
    "mason-pool-15": [
      {"storyPath":"story/DAY15/love/DAY15_01_MASON_AFTERNOON_LOVE.json","stepIndex":5,"branchPath":["then",5],"from":"mason","expectedText":"I just chose not to look good doing it","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY15/love/DAY15_01_MASON_AFTERNOON_LOVE.json","stepIndex":5,"branchPath":["then",3],"from":"player","expectedText":"You can't dive either","requireExpectedText":true}]}
    ],
    "mason-yoga-15": [
      {"storyPath":"story/DAY15/love/DAY15_01_MASON_AFTERNOON_LOVE.json","stepIndex":5,"branchPath":["else",3],"from":"player","expectedText":"Even with a cast, I think I did better","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY15/love/DAY15_01_MASON_AFTERNOON_LOVE.json","stepIndex":5,"branchPath":["else",2],"from":"player","expectedText":"I've never seen someone so stiff","requireExpectedText":true}]}
    ],
    "lena-presentation": [
      {"storyPath":"story/DAY2/DAY2_12_LENA_NIGHT.json","stepIndex":4,"from":"lena","expectedText":"The presentation went really well! Studying afterward was long and hard (no jokes, silly)","requireExpectedText":true}
    ],
    "evelyn-work": [
      {"storyPath":"story/DAY5/DAY5_00_PLAYER_TEXT_EVELYN_RECAP.json","stepIndex":3,"from":"evelyn","expectedText":"But it felt good to be back","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY5/DAY5_00_PLAYER_TEXT_EVELYN_RECAP.json","stepIndex":0,"from":"player","expectedText":"How was yesterday?","requireExpectedText":true}]}
    ],
    "lena-visit": [
      {"storyPath":"story/DAY3/DAY3_08_LENA_EVENING_HOME.json","stepIndex":40,"from":"player","expectedText":"Thank you for taking care of me today","requireExpectedText":true}
    ],
    "hailey-party": [
      {"storyPath":"story/DAY9/love/DAY9_09_HAILEY_EVENING_LOVE.json","stepIndex":14,"from":"hailey","expectedText":"Music loud","requireExpectedText":true},
      {"storyPath":"story/DAY9/ntr/DAY9_10_HAILEY_EVENING_NTR.json","stepIndex":27,"from":"hailey","expectedText":"But the party is actually at the principal's son's place 😭","requireExpectedText":true},
      {"storyPath":"story/DAY10/nts/DAY10_00_HAILEY_MORNING_NTS.json","stepIndex":1,"from":"hailey","expectedText":"Party survived, home safe. Now back to tutor panic 😶","requireExpectedText":true}
    ],
    "hailey-hair": [
      {"storyPath":"story/DAY6/DAY6_05_HAILEY_THANKS_FOR_WARNING_MASON.json","stepIndex":24,"from":"player","expectedText":"Styling crisis solved. My work here is done","requireExpectedText":true}
    ],
    "mason-game-10": [
      {"storyPath":"story/DAY10/love/DAY10_02_MASON_EVENING_LOVE.json","stepIndex":11,"from":"player","expectedText":"That game was actually really fun","requireExpectedText":true}
    ],
    "lena-family-outing-10": [
      {"storyPath":"story/DAY10/love/DAY10_01_LENA_AFTERNOON_LOVE.json","stepIndex":6,"from":"lena","expectedText":"My family is walking a little ahead of me right now","requireExpectedText":true}
    ],
    "hailey-tutor": [
      {"storyPath":"story/DAY10/nts/DAY10_01_HAILEY_AFTERNOON_NTS.json","stepIndex":21,"from":"hailey","expectedText":"He’s making a study plan right now","requireExpectedText":true}
    ],
    "hailey-tutor-11": [
      {"storyPath":"story/DAY11/nts/DAY11_01_HAILEY_AFTERNOON_NTS.json","stepIndex":2,"from":"hailey","expectedText":"We're in the middle of studying","requireExpectedText":true}
    ],
    "hailey-tutor-12": [
      {"storyPath":"story/DAY12/nts/DAY12_02_HAILEY_EVENING_NTS.json","stepIndex":29,"from":"hailey","expectedText":"It went very well","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY12/nts/DAY12_02_HAILEY_EVENING_NTS.json","stepIndex":28,"from":"player","expectedText":"I just want to know how your session went","requireExpectedText":true}]}
    ],
    "hailey-tutor-13": [
      {"storyPath":"story/DAY13/nts/DAY13_02_HAILEY_EVENING_NTS.json","stepIndex":10,"from":"hailey","expectedText":"Passed 😌","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY13/nts/DAY13_02_HAILEY_EVENING_NTS.json","stepIndex":9,"from":"player","expectedText":"And the quiz?","requireExpectedText":true}]}
    ],
    "hailey-tutor-14": [
      {"storyPath":"story/DAY14/nts/DAY14_02_HAILEY_EVENING_NTS.json","stepIndex":18,"from":"hailey","expectedText":"And after the session he even stayed a little longer","requireExpectedText":true}
    ],
    "hailey-tutor-15": [
      {"storyPath":"story/DAY15/nts/DAY15_02_HAILEY_EVENING_NTS.json","stepIndex":3,"from":"hailey","expectedText":"We talked about the exam for a while","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY15/nts/DAY15_02_HAILEY_EVENING_NTS.json","stepIndex":1,"from":"player","expectedText":"How did the debrief go?","requireExpectedText":true}]}
    ],
    "lena-date": [
      {"storyPath":"story/DAY16/love/DAY16_01_LENA_AFTERNOON_LOVE.json","stepIndex":7,"from":"system","expectedText":"{{name:lena}} puts her phone away and walks over to you. She kisses you, then slips her hand into yours. You take the short path through the park, stopping at a bench when your leg starts to tire.","expectedKind":"note","requireExpectedText":true}
    ],
    "lena-love-overnight-20": [
      {"storyPath":"story/DAY20/love/DAY20_02_LENA_LATE_AFTERNOON_LOVE.json","stepIndex":1,"from":"system","expectedText":"AT FIVE — {{name:lena}} arrives at your door with her overnight bag. You let her inside, then gently draw her close before she can start unpacking.","expectedKind":"note","requireExpectedText":true}
    ],
    "mason-doctor": [
      {"storyPath":"story/DAY11/love/DAY11_02_LENA_EVENING_LOVE.json","stepIndex":14,"from":"player","expectedText":"And the doctor came to see me later","requireExpectedText":true},
      {"storyPath":"story/DAY11/love/DAY11_03_LENA_NIGHT_LOVE.json","stepIndex":7,"from":"player","expectedText":"Really well actually","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY11/love/DAY11_03_LENA_NIGHT_LOVE.json","stepIndex":6,"from":"lena","expectedText":"How did the appointment go?","requireExpectedText":true}]}
    ],
    "mason-game": [
      {"storyPath":"story/DAY12/love/DAY12_02_MASON_EVENING_LOVE.json","stepIndex":10,"from":"mason","expectedText":"You took that loss pretty hard","requireExpectedText":true}
    ],
    "mason-coaching-10": [
      {"storyPath":"story/DAY10/nts/DAY10_02_MASON_EVENING_NTS.json","stepIndex":1,"from":"mason","expectedText":"I'm exhausted","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY10/nts/DAY10_02_MASON_EVENING_NTS.json","stepIndex":0,"from":"player","expectedText":"So how was your first session?","requireExpectedText":true}]}
    ],
    "mason-coaching-12": [
      {"storyPath":"story/DAY12/nts/DAY12_00_MASON_MORNING_NTS.json","stepIndex":0,"branchPath":["then",7],"from":"mason","expectedText":"I took it away because {{mason:he}} wasn't focusing on the session","requireExpectedText":true},
      {"storyPath":"story/DAY12/nts/DAY12_00_MASON_MORNING_NTS.json","stepIndex":0,"branchPath":["else",7],"from":"mason","expectedText":"The idiot kept looking at it instead of focusing","requireExpectedText":true},
      {"storyPath":"story/DAY12/nts/DAY12_01_MASON_AFTERNOON_NTS.json","stepIndex":6,"from":"player","expectedText":"You looked so happy suffering through that workout","requireExpectedText":true}
    ],
    "mason-coaching-13": [
      {"storyPath":"story/DAY13/nts/DAY13_01_MASON_AFTERNOON_NTS.json","stepIndex":0,"branchPath":["then",14],"from":"mason","expectedText":"I still have {{name:mason}}'s phone because {{mason:he}} kept trying to use it while running","requireExpectedText":true},
      {"storyPath":"story/DAY13/nts/DAY13_01_MASON_AFTERNOON_NTS.json","stepIndex":0,"branchPath":["else",15],"from":"mason","expectedText":"The idiot kept trying to text while running","requireExpectedText":true},
      {"storyPath":"story/DAY13/nts/DAY13_02_MASON_EVENING_NTS.json","stepIndex":6,"from":"mason","expectedText":"I got to see parts of the forest I'd never seen before","requireExpectedText":true}
    ],
    "evelyn-doctor": [
      {"storyPath":"story/DAY15/love/DAY15_01_EVELYN_AFTERNOON_LOVE.json","stepIndex":11,"from":"player","expectedText":"The doctor removed the cast","requireExpectedText":true},
      {"storyPath":"story/DAY15/nts/DAY15_01_EVELYN_AFTERNOON_NTS.json","stepIndex":1,"from":"player","expectedText":"The doctor removed the cast","requireExpectedText":true},
      {"storyPath":"story/DAY15/nts/DAY15_02_LENA_EVENING_NTS.json","stepIndex":12,"from":"player","expectedText":"Doctor came by today","requireExpectedText":true},
      {"storyPath":"story/DAY15/ntr/DAY15_02_LENA_EVENING_NTR.json","stepIndex":22,"from":"player","expectedText":"The doctor took the cast off today. I still need to take it easy","requireExpectedText":true}
    ],
    "hailey-exam-nts": [
      {"storyPath":"story/DAY15/nts/DAY15_01_HAILEY_AFTERNOON_NTS.json","stepIndex":4,"from":"hailey","expectedText":"I think it went pretty well","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY15/nts/DAY15_01_HAILEY_AFTERNOON_NTS.json","stepIndex":2,"from":"player","expectedText":"How did it go?","requireExpectedText":true}]}
    ],
    "hailey-exam-love": [
      {"storyPath":"story/DAY14/love/DAY14_01_HAILEY_AFTERNOON_LOVE.json","stepIndex":9,"from":"hailey","expectedText":"But I did not leave the page blank at least 😌","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY14/love/DAY14_01_HAILEY_AFTERNOON_LOVE.json","stepIndex":4,"from":"player","expectedText":"How did the first ones go?","requireExpectedText":true}]}
    ],
    "hailey-exam-ntr": [
      {"storyPath":"story/DAY14/ntr/DAY14_01_HAILEY_AFTERNOON_NTR.json","stepIndex":14,"from":"hailey","expectedText":"And I had exam brain","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY14/ntr/DAY14_01_HAILEY_AFTERNOON_NTR.json","stepIndex":1,"from":"hailey","expectedText":"I wrote things","requireExpectedText":true}]},
      {"storyPath":"story/DAY15/ntr/DAY15_00_HAILEY_MORNING_NTR.json","stepIndex":14,"from":"hailey","expectedText":"He said resting is important, especially after a big exam","requireExpectedText":true}
    ],
    "hailey-shopping": [
      {"storyPath":"story/DAY15/love/DAY15_01_HAILEY_AFTERNOON_LOVE.json","stepIndex":1,"from":"hailey","expectedText":"I arrived at the store","requireExpectedText":true}
    ],
    "hailey-professor": [
      {"storyPath":"story/DAY16/ntr/DAY16_01_HAILEY_AFTERNOON_NTR.json","stepIndex":2,"from":"hailey","expectedText":"We’re talking about the next exams right now","requireExpectedText":true}
    ],
    "aiden-games": [
      {"storyPath":"story/DAY20/nts/DAY20_01_HAILEY_AFTERNOON_NTS.json","stepIndex":3,"branchPath":["else",28],"from":"system","expectedText":"AFTER TWO GAMES","expectedKind":"note","requireExpectedText":true}
    ],
    "lena-nts-coffee-18": [
      {"storyPath":"story/DAY18/nts/DAY18_01_LENA_AFTERNOON_NTS.json","stepIndex":51,"from":"lena","expectedText":"I'm outside the café. {{name:aiden}} is already here","requireExpectedText":true},
      {"storyPath":"story/DAY18/nts/DAY18_01_LENA_AFTERNOON_NTS.json","stepIndex":252,"from":"lena","expectedText":"I'm at the café by the shopping street. I found a table by the big windows","requireExpectedText":true}
    ],
    "lena-nts-arcade-19": [
      {"storyPath":"story/DAY19/nts/DAY19_01_LENA_EVENING_NTS.json","stepIndex":38,"from":"lena","expectedText":"He's just arrived and pointed at a racing machine","requireExpectedText":true}
    ],
    "lena-nts-evening-20": [
      {"storyPath":"story/DAY20/nts/DAY20_01_LENA_EVENING_NTS.json","stepIndex":21,"from":"lena","expectedText":"I'm at {{name:aiden}}'s 😊 All good, as promised","requireExpectedText":true},
      {"storyPath":"story/DAY20/nts/DAY20_01_LENA_EVENING_NTS.json","stepIndex":128,"from":"lena","expectedText":"I'm here 😊 Found the right building and everything's fine","requireExpectedText":true}
    ],
    "lena-ntr-bar-17": [
      {"storyPath":"story/DAY17/ntr/DAY17_01_LENA_EVENING_NTR.json","stepIndex":11,"from":"lena","expectedText":"We've got a little table near the side wall","requireExpectedText":true,"requiredAnnouncements":[{"storyPath":"story/DAY17/ntr/DAY17_01_LENA_EVENING_NTR.json","stepIndex":10,"from":"lena","expectedText":"Nice, not too busy yet","requireExpectedText":true}]}
    ],
    "lena-ntr-visit-18": [
      {"storyPath":"story/DAY18/ntr/DAY18_02_LENA_EVENING_NTR.json","stepIndex":14,"from":"lena","expectedText":"I'm home ❤️ Thank you for tonight","requireExpectedText":true}
    ],
    "lena-ntr-dinner-20": [
      {"storyPath":"story/DAY20/ntr/DAY20_01_LENA_EVENING_NTR.json","stepIndex":9,"from":"lena","expectedText":"I've arrived ❤️ I'll text you when I'm back","requireExpectedText":true}
    ],
    "lena-nts-visit-19": [
      {"storyPath":"story/DAY19/nts/DAY19_01_LENA_EVENING_NTS.json","stepIndex":12,"from":"lena","expectedText":"I didn't realize how much I'd missed having you next to me until I was there","requireExpectedText":true}
    ]
  }).map(([id, anchors]) => [id, Object.freeze(anchors.map(freezeOccurrence))])));
  const plans = [
    ['mason-pool-15', 'story/DAY14/love/DAY14_01_MASON_AFTERNOON_LOVE.json', 18, 'mason', 15, 'swimming', 'Swimming session', 'Swimming sounds good', {requireExpectedText: true}],
    ['mason-yoga-15', 'story/DAY14/love/DAY14_01_MASON_AFTERNOON_LOVE.json', 24, 'mason', 15, 'yoga', 'Yoga session', 'Yoga?', {requireExpectedText: true}],
    ['lena-presentation', 'story/DAY1/DAY1_07_LENA_DOUBLE_TEXT.json', 28, 'lena', 2, 'presentation', 'Presentation', 'I have that presentation tomorrow and I keep replaying it in my head'],
    ['lena-sasha', 'story/DAY2/DAY2_12_LENA_NIGHT.json', 22, 'lena', 3, 'outing', 'Outing with Sasha', 'I’m going out with Sasha during the day'],
    ['evelyn-work', 'story/DAY2/DAY2_04_EVELYN_UPDATE.json', 10, 'evelyn', 4, 'work', 'Back to work', 'I start again next Monday', {alsoAnnouncedBy: [
      {storyPath: 'story/DAY3/DAY3_07_EVELYN_AFTERNOON_LAUNDRY.json', stepIndex: 6, from: 'evelyn', expectedText: 'Also, don’t forget. I start work again tomorrow'}
    ]}],
    ['lena-trip', 'story/DAY1/DAY1_07_LENA_DOUBLE_TEXT.json', 44, 'player', 36, 'trip', 'Island trip departure', 'Five weeks before our trip, of course', {knownAtStart: true, contactId: 'lena', requireExpectedText: true}],
    ['lena-visit', 'story/DAY3/DAY3_01_LENA_TICKETS.json', 77, 'lena', 3, 'visit', 'Visit with you', 'Sasha and I postponed our plans, so I can spend the day with you 😌', {requireExpectedText: true}],
    ['hailey-rugby', 'story/DAY4/DAY4_02_HAILEY_WEDNESDAY_RIDE.json', 2, 'hailey', 6, 'rugby', 'Rugby practice', 'I need either {{name:aiden}} or {{name:mason}} to take me to rugby on Wednesday'],
    ['hailey-party', 'story/DAY5/DAY5_07_HAILEY_PARTY_HAIR_HELP.json', 1, 'hailey', 9, 'party', 'Evening party', 'I have a party on Saturday night'],
    ['hailey-hair', 'story/DAY5/DAY5_07_HAILEY_PARTY_HAIR_HELP.json', 2, 'hailey', 6, 'hair', 'Help choosing a hairstyle', 'So I may need your opinion on hair tomorrow'],
    ['mason-workout', 'story/DAY9/love/DAY9_08_MASON_EVENING_LOVE.json', 6, 'player', 10, 'workout', 'Workout together', "Fresh for tomorrow's workout", {requireExpectedText: true, periodId: 'morning',
      periodAnnouncedBy: {storyPath: 'story/DAY10/love/DAY10_00_MASON_MORNING_LOVE.json', stepIndex: 3, from: 'mason', expectedText: "And this time we're doing a real session"},
      alsoAnnouncedBy: [{storyPath: 'story/DAY10/love/DAY10_00_MASON_MORNING_LOVE.json', stepIndex: 3, from: 'mason', expectedText: "And this time we're doing a real session", requireExpectedText: true}]
    }],
    ['mason-game-10', 'story/DAY10/love/DAY10_01_MASON_AFTERNOON_LOVE.json', 12, 'mason', 10, 'game', 'Game together', 'Then we can finally try that game', {requireExpectedText: true, periodId: 'evening',
      alsoAnnouncedBy: [{storyPath: 'story/DAY10/love/DAY10_02_MASON_EVENING_LOVE.json', stepIndex: 11, from: 'player', expectedText: 'That game was actually really fun', requireExpectedText: true}]
    }],
    ['lena-family-outing-10', 'story/DAY10/love/DAY10_00_LENA_MORNING_LOVE.json', 8, 'lena', 10, 'family_outing', 'Family outing', "I'm probably going to spend some time with my family", {contactId: 'lena', requireExpectedText: true, alsoAnnouncedBy: [
      {storyPath: 'story/DAY10/love/DAY10_01_LENA_AFTERNOON_LOVE.json', stepIndex: 6, from: 'lena', expectedText: 'My family is walking a little ahead of me right now', requireExpectedText: true}
    ]}],
    ['hailey-tutor', 'story/DAY9/nts/DAY9_11_HAILEY_EVENING_NTS.json', 14, 'player', 10, 'tutoring', 'Tutoring session', 'Tomorrow afternoon', {contactId: 'hailey', routeContactId: 'hailey', alsoAnnouncedBy: [
      {storyPath: 'story/DAY9/nts/DAY9_05_TUTOR_SEARCH_NTS.json', stepIndex: 21, from: 'player', expectedText: 'Perfect'},
      {storyPath: 'story/DAY9/nts/DAY9_11_HAILEY_EVENING_NTS.json', stepIndex: 24, from: 'hailey', expectedText: "I'll try to make a good first impression tomorrow 😊"},
      {storyPath: 'story/DAY10/nts/DAY10_00_HAILEY_MORNING_NTS.json', stepIndex: 4, from: 'hailey', expectedText: "Because he's coming over today!"}
    ]}],
    ['hailey-tutor-11', 'story/DAY11/nts/DAY11_00_HAILEY_MORNING_NTS.json', 8, 'player', 11, 'tutoring', 'Tutoring session', 'Ready for another study session later?'],
    ['hailey-tutor-12', 'story/DAY12/nts/DAY12_00_HAILEY_MORNING_NTS.json', 26, 'player', 12, 'tutoring', 'Tutoring session', "I'll ask your private {{name:tutor}} to give you extra exercises today"],
    ['hailey-tutor-13', 'story/DAY13/nts/DAY13_00_HAILEY_MORNING_NTS.json', 11, 'hailey', 13, 'tutoring', 'Tutoring session', 'Yeah'],
    ['hailey-tutor-14', 'story/DAY14/nts/DAY14_00_HAILEY_MORNING_NTS.json', 4, 'hailey', 14, 'tutoring', 'Tutoring session', 'And Ethan said he wants to do a full review session'],
    ['hailey-tutor-15', 'story/DAY15/nts/DAY15_00_HAILEY_MORNING_NTS.json', 12, 'player', 15, 'tutoring', 'Tutoring session', 'You still have a session with Ethan later'],
    ['lena-date', 'story/DAY10/love/DAY10_02_LENA_EVENING_LOVE.json', 13, 'player', 16, 'date', 'Date and dinner', "Then it's a plan", {contactId: 'lena', routeContactId: 'lena', requireExpectedText: true, minuteOfDay: 900,
      timeAnnouncedBy: {storyPath: 'story/DAY16/love/DAY16_00_LENA_MORNING_LOVE.json', stepIndex: 35, from: 'lena', expectedText: 'Three it is', requireExpectedText: true},
      alsoAnnouncedBy: [
        {storyPath: 'story/DAY16/love/DAY16_00_LENA_MORNING_LOVE.json', stepIndex: 5, from: 'lena', expectedText: "I just don't want our park date getting rained on", requireExpectedText: true},
        {storyPath: 'story/DAY16/love/DAY16_00_LENA_MORNING_LOVE.json', stepIndex: 35, from: 'lena', expectedText: 'Three it is', requireExpectedText: true}
      ]
    }],
    ['lena-love-overnight-20', 'story/DAY19/love/DAY19_02_LENA_EVENING_LOVE.json', 12, 'lena', 20, 'visit', 'Visit with you', 'Yes ❤️', {contactId: 'lena', routeContactId: 'lena', requireExpectedText: true, minuteOfDay: 1020,
      timeAnnouncedBy: {storyPath: 'story/DAY19/love/DAY19_02_LENA_EVENING_LOVE.json', stepIndex: 20, from: 'lena', expectedText: 'I can go home, get my things and come over around five', requireExpectedText: true},
      alsoAnnouncedBy: [
        {storyPath: 'story/DAY19/love/DAY19_02_LENA_EVENING_LOVE.json', stepIndex: 20, from: 'lena', expectedText: 'I can go home, get my things and come over around five', requireExpectedText: true},
        {storyPath: 'story/DAY20/love/DAY20_00_LENA_MORNING_LOVE.json', stepIndex: 8, from: 'lena', expectedText: 'You will. Around five, like we said', requireExpectedText: true},
        {storyPath: 'story/DAY20/love/DAY20_01_LENA_AFTERNOON_LOVE.json', stepIndex: 7, from: 'lena', expectedText: "Then I'll see you at five", requireExpectedText: true}
      ]
    }],
    ['mason-doctor', 'story/DAY10/ntr/DAY10_02_MASON_EVENING_NTR.json', 10, 'mason', 11, 'doctor', 'Doctor visit', 'The doctor is coming tomorrow morning', {contactId: 'player', alsoAnnouncedBy: [
      {storyPath: 'story/DAY11/DAY11_00_AIDEN_SHARED.json', stepIndex: 4, from: 'player', expectedText: 'I have a check-up today, then another on Friday', requireExpectedText: true},
      {storyPath: 'story/DAY11/love/DAY11_02_LENA_EVENING_LOVE.json', stepIndex: 14, from: 'player', expectedText: 'And the doctor came to see me later', requireExpectedText: true},
      {storyPath: 'story/DAY11/love/DAY11_03_LENA_NIGHT_LOVE.json', stepIndex: 6, from: 'lena', expectedText: 'How did the appointment go?', requireExpectedText: true}
    ]}],
    ['mason-game', 'story/DAY11/love/DAY11_02_MASON_EVENING_LOVE.json', 0, 'mason', 12, 'game', 'Game together', "We're playing tomorrow"],
    ['mason-coaching-10', 'story/DAY10/nts/DAY10_00_MASON_MORNING_NTS.json', 0, 'mason', 10, 'coaching', 'Coaching session', 'Hey, what time is my session with {{name:aiden}}?', {requireExpectedText: true, branchPath: ['else', 0], alsoAnnouncedBy: [
      {storyPath: 'story/DAY10/nts/DAY10_00_MASON_MORNING_NTS.json', stepIndex: 0, branchPath: ['then', 0], from: 'mason', expectedText: 'Hey, what time is my session with Chris?', requireExpectedText: true},
      {storyPath: 'story/DAY10/nts/DAY10_01_MASON_AFTERNOON_NTS.json', stepIndex: 0, branchPath: ['else', 0], from: 'player', expectedText: '{{name:aiden}} will be there in an hour', requireExpectedText: true},
      {storyPath: 'story/DAY10/nts/DAY10_01_MASON_AFTERNOON_NTS.json', stepIndex: 0, branchPath: ['then', 0], from: 'player', expectedText: 'Chris will be there in an hour', requireExpectedText: true}
    ]}],
    ['mason-coaching-12', 'story/DAY11/nts/DAY11_02_MASON_EVENING_NTS.json', 8, 'player', 12, 'coaching', 'Coaching session', 'I booked another coaching session for you tomorrow morning', {minuteOfDay: 480, timeAnnouncedBy: {storyPath: 'story/DAY11/nts/DAY11_02_MASON_EVENING_NTS.json', stepIndex: 11, from: 'player', expectedText: '8 AM'}}],
    ['mason-coaching-13', 'story/DAY12/nts/DAY12_02_MASON_EVENING_NTS.json', 13, 'player', 13, 'coaching', 'Coaching session', 'You have a session tomorrow at 8 AM', {minuteOfDay: 480, rescheduledPeriodId: 'after_work', rescheduledBy: {storyPath: 'story/DAY12/nts/DAY12_02_MASON_EVENING_NTS.json', stepIndex: 17, from: 'player', expectedText: 'Your session starts as soon as you get home then', requireExpectedText: true}}],
    ['hailey-revision', 'story/DAY13/love/DAY13_01_HAILEY_AFTERNOON_LOVE.json', 19, 'player', 14, 'revision', 'Revision day', 'Today and tomorrow are revision days'],
    ['hailey-quiz', 'story/DAY13/ntr/DAY13_00_HAILEY_MORNING_NTR.json', 15, 'hailey', 14, 'quiz', 'Practice quiz', 'If I do well on the quiz tomorrow, he will personally take me shopping himself'],
    ['evelyn-doctor', 'story/DAY12/nts/DAY12_00_HAILEY_MORNING_NTS.json', 8, 'player', 15, 'doctor', 'Doctor visit', 'This Friday', {contactId: 'player', requireExpectedText: true, alsoAnnouncedBy: [
      {storyPath: 'story/DAY14/love/DAY14_00_EVELYN_MORNING_LOVE.json', stepIndex: 24, from: 'evelyn', expectedText: 'The doctor is coming tomorrow'},
      {storyPath: 'story/DAY15/nts/DAY15_00_EVELYN_MORNING_NTS.json', stepIndex: 4, from: 'evelyn', expectedText: "You have your doctor's appointment today, right?"},
      {storyPath: 'story/DAY11/DAY11_00_AIDEN_SHARED.json', stepIndex: 4, from: 'player', expectedText: 'I have a check-up today, then another on Friday', requireExpectedText: true},
      {storyPath: 'story/DAY14/ntr/DAY14_02_EVELYN_EVENING_NTR.json', stepIndex: 9, from: 'evelyn', expectedText: "I'm more worried about your recovery. Don't forget the doctor is coming tomorrow to check your leg", requireExpectedText: true},
      {storyPath: 'story/DAY15/DAY15_00_AIDEN_SHARED.json', stepIndex: 2, from: 'player', expectedText: 'The doctor is checking my leg today, so I should know more after that', requireExpectedText: true}
    ]}],
    ['hailey-exam-nts', 'story/DAY14/nts/DAY14_00_HAILEY_MORNING_NTS.json', 3, 'hailey', 15, 'exam', 'Final exam', "We need to study at school for tomorrow's final exam", {requireExpectedText: true, alsoAnnouncedBy: [
      {storyPath: 'story/DAY15/nts/DAY15_00_HAILEY_MORNING_NTS.json', stepIndex: 0, from: 'hailey', expectedText: "It's exam day 😭"}
    ]}],
    ['hailey-exam-love', 'story/DAY14/love/DAY14_00_HAILEY_MORNING_LOVE.json', 2, 'hailey', 14, 'exam', 'Final exam', 'Today is the big test day'],
    ['hailey-exam-ntr', 'story/DAY14/ntr/DAY14_00_HAILEY_MORNING_NTR.json', 2, 'hailey', 14, 'exam', 'Final exam', 'Real academic war'],
    ['hailey-shopping', 'story/DAY14/love/DAY14_00_HAILEY_MORNING_LOVE.json', 9, 'player', 15, 'shopping', 'Shopping trip', "Just focus on tomorrow's shopping reward"],
    ['hailey-professor', 'story/DAY15/ntr/DAY15_02_HAILEY_EVENING_NTR.json', 28, 'hailey', 16, 'tutoring', 'Tutoring session', 'And tomorrow I need to see professor'],
    ['aiden-games', 'story/DAY19/nts/DAY19_02_AIDEN_EVENING_NTS.json', 44, 'aiden', 20, 'games_afternoon', 'Afternoon of games', 'I’m coming over tomorrow for a game afternoon'],
    ['lena-nts-coffee-18', 'story/DAY17/nts/DAY17_02_LENA_EVENING_NTS.json', 30, 'lena', 18, 'coffee_date', 'Coffee date', "{{name:aiden}} finishes early enough, so we're meeting at the café near campus at half past three", {requireExpectedText: true, minuteOfDay: 930, alsoAnnouncedBy: [
      {storyPath: 'story/DAY17/nts/DAY17_02_LENA_EVENING_NTS.json', stepIndex: 49, from: 'lena', expectedText: "We're meeting at the café by the main shopping street at half past three", requireExpectedText: true}
    ]}],
    ['lena-nts-arcade-19', 'story/DAY19/nts/DAY19_01_LENA_EVENING_NTS.json', 23, 'lena', 19, 'arcade_date', 'Arcade date', "I'm going to meet {{name:aiden}} after I've dropped the container at home 😊", {requireExpectedText: true}],
    ['lena-nts-evening-20', 'story/DAY20/nts/DAY20_00_LENA_MORNING_NTS.json', 48, 'lena', 20, 'evening_date', 'Evening date', "Okay 😊 I'll go home and get ready first, then head over around eight", {requireExpectedText: true, minuteOfDay: 1200}],
    ['lena-ntr-bar-17', 'story/DAY16/ntr/DAY16_02_LENA_EVENING_NTR.json', 46, 'lena', 17, 'drinks_after_work', 'Drinks after work', 'Yeah, I do', {requireExpectedText: true, minuteOfDay: 1140,
      timeAnnouncedBy: {storyPath: 'story/DAY16/ntr/DAY16_02_LENA_EVENING_NTR.json', stepIndex: 44, from: 'lena', expectedText: "Around seven, so I'll go straight from work", requireExpectedText: true},
      alsoAnnouncedBy: [{storyPath: 'story/DAY17/ntr/DAY17_00_LENA_MORNING_NTR.json', stepIndex: 63, from: 'lena', expectedText: "I'll text you when I get to the bar tonight, like I said", requireExpectedText: true}]
    }],
    ['lena-ntr-visit-18', 'story/DAY17/ntr/DAY17_02_LENA_NIGHT_NTR.json', 120, 'player', 18, 'visit', 'Visit with you', 'Yeah, of course', {contactId: 'lena', requireExpectedText: true, minuteOfDay: 1080,
      timeAnnouncedBy: {storyPath: 'story/DAY17/ntr/DAY17_02_LENA_NIGHT_NTR.json', stepIndex: 119, from: 'lena', expectedText: 'Can I come over after work? Around six?', requireExpectedText: true},
      alsoAnnouncedBy: [
        {storyPath: 'story/DAY18/ntr/DAY18_00_LENA_MORNING_NTR.json', stepIndex: 28, from: 'lena', expectedText: "Yeah, I finish at five. I'll stop on the way and come straight over", requireExpectedText: true},
        {storyPath: 'story/DAY18/ntr/DAY18_01_LENA_AFTERNOON_NTR.json', stepIndex: 70, from: 'lena', expectedText: 'See you around six ❤️', requireExpectedText: true}
      ]
    }],
    ['lena-ntr-dinner-20', 'story/DAY19/ntr/DAY19_02_LENA_EVENING_NTR.json', 25, 'lena', 20, 'work_dinner', 'Dinner with coworkers', 'A few people from work are having dinner', {requireExpectedText: true}],
    ['lena-nts-visit-19', 'story/DAY18/nts/DAY18_02_LENA_EVENING_NTS.json', 201, 'player', 19, 'visit', 'Visit with you', 'For a woman with a film and an unreasonable amount of pasta? Yes', {contactId: 'lena', requireExpectedText: true, minuteOfDay: 810,
      timeAnnouncedBy: {storyPath: 'story/DAY19/nts/DAY19_00_LENA_MORNING_NTS.json', stepIndex: 97, from: 'lena', expectedText: 'Perfect', requireExpectedText: true},
      alsoAnnouncedBy: [{storyPath: 'story/DAY19/nts/DAY19_00_LENA_MORNING_NTS.json', stepIndex: 97, from: 'lena', expectedText: 'Perfect', requireExpectedText: true}]
    }]
  ].map(([id, storyPath, stepIndex, from, day, labelId, label, expectedText, options = {}]) => Object.freeze({id, storyPath, stepIndex, from, day, labelId, label, expectedText, ...options,
    ...(occurredBy[id] ? {occurredBy: occurredBy[id]} : {}),
    ...(id === 'lena-sasha' ? {postponedBy: Object.freeze({storyPath: 'story/DAY3/DAY3_01_LENA_TICKETS.json', stepIndex: 77, from: 'lena', expectedText: 'Sasha and I postponed our plans, so I can spend the day with you 😌'})} : {})}));
  // Day-local routines come only from public dialogue. They are never expanded
  // into a recurring timetable, and a disclosed finish time is not a start time.
  const routines = [
    // The MC's moderation work has no fixed shifts. Record each disclosed day,
    // with Evelyn as route authority and the player as the person doing it.
    {"id":"player-home-work-11-evelyn-love","storyPath":"story/DAY10/love/DAY10_01_EVELYN_AFTERNOON_LOVE.json","stepIndex":2,"from":"player","expectedText":"Tomorrow","day":11,"contactId":"player","routeContactId":"evelyn","labelId":"work_from_home","label":"Work from home","requiredAnnouncements":[{"storyPath":"story/DAY10/love/DAY10_01_EVELYN_AFTERNOON_LOVE.json","stepIndex":1,"from":"evelyn","expectedText":"When does your new work start?"}],"alsoAnnouncedBy":[
      {"storyPath":"story/DAY11/love/DAY11_00_EVELYN_MORNING_LOVE.json","stepIndex":19,"from":"player","expectedText":"They said it can happen at any time between 9 AM and 6 PM","requiredAnnouncements":[{"storyPath":"story/DAY11/love/DAY11_00_EVELYN_MORNING_LOVE.json","stepIndex":17,"from":"evelyn","expectedText":"Do you have any idea what time your work might start?"}]},
      {"storyPath":"story/DAY11/love/DAY11_01_EVELYN_AFTERNOON_LOVE.json","stepIndex":5,"from":"player","expectedText":"I had a big session from 10 to 11:30","requiredAnnouncements":[{"storyPath":"story/DAY11/love/DAY11_01_EVELYN_AFTERNOON_LOVE.json","stepIndex":3,"from":"evelyn","expectedText":"Did you start work already?"}]},
      {"storyPath":"story/DAY11/love/DAY11_02_EVELYN_EVENING_LOVE.json","stepIndex":3,"from":"player","expectedText":"I finished work for today"}
    ]},
    {"id":"player-home-work-12-evelyn-love","storyPath":"story/DAY12/love/DAY12_00_EVELYN_MORNING_LOVE.json","stepIndex":3,"from":"evelyn","expectedText":"You need to be ready in case work starts","day":12,"contactId":"player","routeContactId":"evelyn","labelId":"work_from_home","label":"Work from home","alsoAnnouncedBy":[{"storyPath":"story/DAY12/love/DAY12_02_EVELYN_EVENING_LOVE.json","stepIndex":1,"from":"evelyn","expectedText":"How was your second day of work?"}]},
    {"id":"player-home-work-13-evelyn-love","storyPath":"story/DAY13/love/DAY13_00_EVELYN_MORNING_LOVE.json","stepIndex":3,"from":"evelyn","expectedText":"Ready for another day of work?","day":13,"contactId":"player","routeContactId":"evelyn","labelId":"work_from_home","label":"Work from home","alsoAnnouncedBy":[{"storyPath":"story/DAY13/love/DAY13_01_EVELYN_AFTERNOON_LOVE.json","stepIndex":6,"from":"player","expectedText":"Also, after work tonight, I'd like to watch the next episode of that series we started yesterday"}]},
    {"id":"player-home-work-14-evelyn-love","storyPath":"story/DAY14/love/DAY14_00_EVELYN_MORNING_LOVE.json","stepIndex":30,"from":"player","expectedText":"Anyway, I should get ready for work","day":14,"contactId":"player","routeContactId":"evelyn","labelId":"work_from_home","label":"Work from home","alsoAnnouncedBy":[{"storyPath":"story/DAY14/love/DAY14_02_EVELYN_EVENING_LOVE.json","stepIndex":3,"from":"player","expectedText":"I just finished","requiredAnnouncements":[{"storyPath":"story/DAY14/love/DAY14_02_EVELYN_EVENING_LOVE.json","stepIndex":1,"from":"evelyn","expectedText":"Did you finish work?"}]}]},
    {"id":"player-home-work-15-evelyn-love","storyPath":"story/DAY15/love/DAY15_00_EVELYN_MORNING_LOVE.json","stepIndex":25,"from":"evelyn","expectedText":"The doctor is coming after work today","day":15,"contactId":"player","routeContactId":"evelyn","labelId":"work_from_home","label":"Work from home","alsoAnnouncedBy":[{"storyPath":"story/DAY15/love/DAY15_00_EVELYN_MORNING_LOVE.json","stepIndex":38,"from":"evelyn","expectedText":"Good luck with work 😊"}]},
    {"id":"lena-work-1","storyPath":"story/DAY1/DAY1_07_LENA_DOUBLE_TEXT.json","stepIndex":23,"from":"lena","expectedText":"I was thinking about you earlier at work","day":1,"contactId":"lena","labelId":"work","label":"Work"},
    {"id":"lena-university-1","storyPath":"story/DAY1/DAY1_07_LENA_DOUBLE_TEXT.json","stepIndex":27,"from":"lena","expectedText":"University was heavier though","day":1,"contactId":"lena","labelId":"university","label":"University"},
    {"id":"lena-work-2","storyPath":"story/DAY1/DAY1_07_LENA_DOUBLE_TEXT.json","stepIndex":34,"from":"lena","expectedText":"Work in the morning, then the presentation and probably more studying","day":2,"contactId":"lena","labelId":"work","label":"Work","periodId":"morning","alsoAnnouncedBy":[{"storyPath":"story/DAY2/DAY2_01_LENA_MORNING.json","stepIndex":23,"from":"lena","expectedText":"Getting ready for work"}]},
    {"id":"lena-university-4","storyPath":"story/DAY4/DAY4_08_LENA_EVENING.json","stepIndex":4,"from":"lena","expectedText":"Uni this morning","day":4,"contactId":"lena","labelId":"university","label":"University","periodId":"morning"},
    {"id":"lena-work-4","storyPath":"story/DAY4/DAY4_08_LENA_EVENING.json","stepIndex":5,"from":"lena","expectedText":"Then work until 4","day":4,"contactId":"lena","labelId":"work","label":"Work","periodId":"until","periodMinute":960},
    {"id":"lena-university-5","storyPath":"story/DAY5/DAY5_02_LENA_LUNCH_AIDEN.json","stepIndex":26,"from":"lena","expectedText":"See you after class ❤️","day":5,"contactId":"lena","labelId":"university","label":"University"},
    {"id":"lena-work-5","storyPath":"story/DAY5/DAY5_03_LENA_WORK_BREAK.json","stepIndex":2,"from":"lena","expectedText":"Now I still have work until 14","day":5,"contactId":"lena","labelId":"work","label":"Work","periodId":"until","periodMinute":840},
    {"id":"lena-part-time-5","storyPath":"story/DAY5/DAY5_03_LENA_WORK_BREAK.json","stepIndex":3,"from":"lena","expectedText":"Then my part time job until 18 😭","day":5,"contactId":"lena","labelId":"part_time","label":"Part-time job","periodId":"until","periodMinute":1080},
    {"id":"lena-university-6","storyPath":"story/DAY6/DAY6_01_LENA_MORNING.json","stepIndex":20,"from":"lena","expectedText":"Class first","day":6,"contactId":"lena","labelId":"university","label":"University","periodId":"until","initialPeriodId":"morning","periodMinute":840,"periodAnnouncedBy":{"storyPath":"story/DAY6/DAY6_04_LENA_LUNCH_AIDEN_CHARM.json","stepIndex":29,"from":"lena","expectedText":"I still have class until 14"},"alsoAnnouncedBy":[{"storyPath":"story/DAY6/DAY6_04_LENA_LUNCH_AIDEN_CHARM.json","stepIndex":29,"from":"lena","expectedText":"I still have class until 14"}]},
    {"id":"lena-work-6","storyPath":"story/DAY6/DAY6_04_LENA_LUNCH_AIDEN_CHARM.json","stepIndex":30,"from":"lena","expectedText":"Then I go straight to work","day":6,"contactId":"lena","labelId":"work","label":"Work","periodId":"after_classes","alsoAnnouncedBy":[{"storyPath":"story/DAY6/DAY6_06_LENA_AFTER_UNI_TO_JOB.json","stepIndex":4,"from":"lena","expectedText":"And now I'm on my way to work"}]},
    {"id":"lena-class-cancelled-7","storyPath":"story/DAY7/DAY7_00_LENA_MORNING_NO_CLASS.json","stepIndex":22,"from":"lena","expectedText":"Two classes got cancelled this morning","day":7,"contactId":"lena","labelId":"classes_cancelled","label":"Classes cancelled","periodId":"morning"},
    {"id":"lena-work-7","storyPath":"story/DAY7/DAY7_03_LENA_VISIT_PLAYER.json","stepIndex":24,"from":"lena","expectedText":"Then I go to work","day":7,"contactId":"lena","labelId":"work","label":"Work","periodId":"after_lunch","alsoAnnouncedBy":[{"storyPath":"story/DAY7/DAY7_04_LENA_LUNCH_COWORKER_FRIEND.json","stepIndex":47,"from":"lena","expectedText":"I'm heading to work now"}]},
    {"id":"lena-work-8","storyPath":"story/DAY8/DAY8_03_LENA_LUNCH_AIDEN.json","stepIndex":22,"from":"lena","expectedText":"I'm going straight to work after this","day":8,"contactId":"lena","labelId":"work","label":"Work","periodId":"after_lunch"},
    {"id":"lena-home-work-9-love","storyPath":"story/DAY9/love/DAY9_03_LENA_LATE_MORNING_LOVE.json","stepIndex":40,"from":"lena","expectedText":"But I should clean a little and work from home for a while","day":9,"contactId":"lena","labelId":"work_from_home","label":"Work from home"},
    {"id":"lena-home-work-9-nts","storyPath":"story/DAY9/nts/DAY9_03_LENA_LATE_MORNING_NTS.json","stepIndex":41,"from":"lena","expectedText":"I'm going to clean a little and work from home for a bit","day":9,"contactId":"lena","labelId":"work_from_home","label":"Work from home"},
    {"id":"lena-home-work-9-ntr","storyPath":"story/DAY9/ntr/DAY9_03_LENA_LATE_MORNING_NTR.json","stepIndex":25,"from":"lena","expectedText":"I'm going to clean a bit and work from home for a while","day":9,"contactId":"lena","labelId":"work_from_home","label":"Work from home"},
    {"id":"lena-university-11-love","storyPath":"story/DAY11/love/DAY11_00_LENA_MORNING_LOVE.json","stepIndex":4,"from":"lena","expectedText":"University this morning","day":11,"contactId":"lena","labelId":"university","label":"University","periodId":"morning"},
    {"id":"lena-part-time-11-love","storyPath":"story/DAY11/love/DAY11_00_LENA_MORNING_LOVE.json","stepIndex":5,"from":"lena","expectedText":"Then my part time job after","day":11,"contactId":"lena","labelId":"part_time","label":"Part-time job","periodId":"after_classes","alsoAnnouncedBy":[{"storyPath":"story/DAY11/love/DAY11_03_LENA_NIGHT_LOVE.json","stepIndex":1,"from":"lena","expectedText":"I just got back from work"}]},
    {"id":"lena-university-11-ntr","storyPath":"story/DAY11/ntr/DAY11_00_LENA_MORNING_NTR.json","stepIndex":6,"from":"lena","expectedText":"And work","day":11,"contactId":"lena","labelId":"university","label":"University","requiredAnnouncements":[{"storyPath":"story/DAY11/ntr/DAY11_00_LENA_MORNING_NTR.json","stepIndex":5,"from":"player","expectedText":"University?"}],"alsoAnnouncedBy":[{"storyPath":"story/DAY11/ntr/DAY11_02_LENA_EVENING_NTR.json","stepIndex":4,"from":"lena","expectedText":"University was fine"}]},
    {"id":"lena-work-11-ntr","storyPath":"story/DAY11/ntr/DAY11_00_LENA_MORNING_NTR.json","stepIndex":6,"from":"lena","expectedText":"And work","day":11,"contactId":"lena","labelId":"work","label":"Work","alsoAnnouncedBy":[{"storyPath":"story/DAY11/ntr/DAY11_02_LENA_EVENING_NTR.json","stepIndex":5,"from":"lena","expectedText":"But work is moving fast today"}]},
    {"id":"lena-university-11-nts","storyPath":"story/DAY11/nts/DAY11_00_LENA_MORNING_NTS.json","stepIndex":15,"from":"lena","expectedText":"I have classes this morning","day":11,"contactId":"lena","labelId":"university","label":"University","periodId":"morning"},
    {"id":"lena-work-12-love","storyPath":"story/DAY12/love/DAY12_02_LENA_EVENING_LOVE.json","stepIndex":2,"from":"lena","expectedText":"Work was awful today","day":12,"contactId":"lena","labelId":"work","label":"Work"},
    {"id":"lena-part-time-12-ntr","storyPath":"story/DAY12/ntr/DAY12_00_LENA_MORNING_NTR.json","stepIndex":11,"from":"lena","expectedText":"Part-time job from morning to evening","day":12,"contactId":"lena","labelId":"part_time","label":"Part-time job","periodId":"all_day"},
    {"id":"lena-university-13-love","storyPath":"story/DAY13/love/DAY13_00_LENA_MORNING_LOVE.json","stepIndex":10,"from":"lena","expectedText":"But I wanted to make you smile before class","day":13,"contactId":"lena","labelId":"university","label":"University","periodId":"until","periodMinute":720,"periodAnnouncedBy":{"storyPath":"story/DAY13/love/DAY13_00_LENA_MORNING_LOVE.json","stepIndex":13,"from":"lena","expectedText":"Normally I finish at noon today"}},
    {"id":"lena-university-13-nts","storyPath":"story/DAY13/nts/DAY13_00_LENA_MORNING_NTS.json","stepIndex":10,"from":"lena","expectedText":"But I wanted to make you smile before class","day":13,"contactId":"lena","labelId":"university","label":"University","periodId":"until","periodMinute":720,"periodAnnouncedBy":{"storyPath":"story/DAY13/nts/DAY13_00_LENA_MORNING_NTS.json","stepIndex":13,"from":"lena","expectedText":"Normally I finish at noon today"}},
    {"id":"lena-university-13-ntr","storyPath":"story/DAY13/ntr/DAY13_00_LENA_MORNING_NTR.json","stepIndex":11,"from":"lena","expectedText":"University first, then work again","day":13,"contactId":"lena","labelId":"university","label":"University"},
    {"id":"lena-work-13-ntr","storyPath":"story/DAY13/ntr/DAY13_00_LENA_MORNING_NTR.json","stepIndex":11,"from":"lena","expectedText":"University first, then work again","day":13,"contactId":"lena","labelId":"work","label":"Work","periodId":"after_classes"},
    {"id":"lena-university-14-love","storyPath":"story/DAY14/love/DAY14_00_LENA_MORNING_LOVE.json","stepIndex":27,"from":"lena","expectedText":"Now behave while I'm in class 😌","day":14,"contactId":"lena","labelId":"university","label":"University","alsoAnnouncedBy":[{"storyPath":"story/DAY14/love/DAY14_01_LENA_BREAK_LOVE.json","stepIndex":4,"from":"lena","expectedText":"So basically a classic university morning 😌"}]},
    {"id":"lena-university-14-nts","storyPath":"story/DAY14/nts/DAY14_00_LENA_MORNING_NTS.json","stepIndex":27,"from":"lena","expectedText":"Now behave while I'm in class 😌","day":14,"contactId":"lena","labelId":"university","label":"University","alsoAnnouncedBy":[{"storyPath":"story/DAY14/nts/DAY14_01_LENA_BREAK_NTS.json","stepIndex":4,"from":"lena","expectedText":"So basically a classic university morning 😌"}]},
    {"id":"lena-university-14-ntr","storyPath":"story/DAY14/ntr/DAY14_00_LENA_MORNING_NTR.json","stepIndex":12,"from":"lena","expectedText":"Yeah","day":14,"contactId":"lena","labelId":"university","label":"University","requiredAnnouncements":[{"storyPath":"story/DAY14/ntr/DAY14_00_LENA_MORNING_NTR.json","stepIndex":11,"from":"player","expectedText":"University and work?"}],"alsoAnnouncedBy":[{"storyPath":"story/DAY14/ntr/DAY14_01_LENA_BREAK_NTR.json","stepIndex":4,"from":"lena","expectedText":"So basically a classic university morning 😌"}]},
    {"id":"lena-work-14-ntr","storyPath":"story/DAY14/ntr/DAY14_00_LENA_MORNING_NTR.json","stepIndex":12,"from":"lena","expectedText":"Yeah","day":14,"contactId":"lena","labelId":"work","label":"Work","requiredAnnouncements":[{"storyPath":"story/DAY14/ntr/DAY14_00_LENA_MORNING_NTR.json","stepIndex":11,"from":"player","expectedText":"University and work?"}]},
    {"id":"lena-university-15-love","storyPath":"story/DAY15/love/DAY15_00_LENA_MORNING_LOVE.json","stepIndex":12,"from":"lena","expectedText":"University this morning","day":15,"contactId":"lena","labelId":"university","label":"University","periodId":"morning"},
    {"id":"lena-games-17-love","storyPath":"story/DAY17/love/DAY17_02_LENA_EVENING_LOVE.json","stepIndex":11,"from":"player","expectedText":"Yeah. I'd love to play with you","day":17,"contactId":"lena","labelId":"game","label":"Game together","periodId":"evening","requiredAnnouncements":[{"storyPath":"story/DAY17/love/DAY17_02_LENA_EVENING_LOVE.json","stepIndex":4,"from":"lena","expectedText":"Would you play something with me tonight?"}]},
    {"id":"lena-visit-18-love","storyPath":"story/DAY18/love/DAY18_00_LENA_MORNING_LOVE.json","stepIndex":20,"from":"lena","expectedText":"Okay ❤️","day":18,"contactId":"lena","labelId":"visit","label":"Visit with you","periodId":"after_work","periodAnnouncedBy":{"storyPath":"story/DAY18/love/DAY18_00_LENA_MORNING_LOVE.json","stepIndex":21,"from":"lena","expectedText":"University, work, then you. That's my Monday sorted"},"requiredAnnouncements":[{"storyPath":"story/DAY18/love/DAY18_00_LENA_MORNING_LOVE.json","stepIndex":13,"from":"player","expectedText":"Come over after your day. You can practise with me"}]},
    {"id":"lena-university-18-love","storyPath":"story/DAY18/love/DAY18_00_LENA_MORNING_LOVE.json","stepIndex":2,"from":"lena","expectedText":"Maybe. But I remembered I actually have class this morning","day":18,"contactId":"lena","labelId":"university","label":"University","periodId":"morning"},
    {"id":"lena-work-18-love","storyPath":"story/DAY18/love/DAY18_00_LENA_MORNING_LOVE.json","stepIndex":21,"from":"lena","expectedText":"University, work, then you. That's my Monday sorted","day":18,"contactId":"lena","labelId":"work","label":"Work","periodId":"after_classes"},
    {"id":"lena-presentation-19-love","storyPath":"story/DAY19/love/DAY19_00_LENA_MORNING_LOVE.json","stepIndex":16,"from":"lena","expectedText":"Ready. Notes checked, laptop charged, no bags left at your place","day":19,"contactId":"lena","labelId":"presentation","label":"Presentation","requiredAnnouncements":[{"storyPath":"story/DAY19/love/DAY19_00_LENA_MORNING_LOVE.json","stepIndex":1,"from":"player","expectedText":"The same one you got through without your notes last night?"}]},
    {"id":"lena-university-20-love","storyPath":"story/DAY20/love/DAY20_00_LENA_MORNING_LOVE.json","stepIndex":12,"from":"lena","expectedText":"Ready for university. And impatient for it to finish","day":20,"contactId":"lena","labelId":"university","label":"University","periodId":"morning"},
    {"id":"lena-work-15-ntr","storyPath":"story/DAY15/ntr/DAY15_02_LENA_EVENING_NTR.json","stepIndex":6,"from":"lena","expectedText":"Just work","day":15,"contactId":"lena","labelId":"work","label":"Work"},
    {"id":"lena-university-15-nts","storyPath":"story/DAY15/nts/DAY15_02_LENA_EVENING_NTS.json","stepIndex":6,"from":"lena","expectedText":"Too many classes, too many people 😭","day":15,"contactId":"lena","labelId":"university","label":"University"},
    {"id":"lena-university-16-ntr","storyPath":"story/DAY16/ntr/DAY16_00_LENA_MORNING_NTR.json","stepIndex":53,"from":"lena","expectedText":"Classes this morning, then work","day":16,"contactId":"lena","labelId":"university","label":"University","periodId":"morning"},
    {"id":"lena-work-16-ntr","storyPath":"story/DAY16/ntr/DAY16_00_LENA_MORNING_NTR.json","stepIndex":53,"from":"lena","expectedText":"Classes this morning, then work","day":16,"contactId":"lena","labelId":"work","label":"Work","periodId":"after_classes"},
    {"id":"lena-university-16-nts","storyPath":"story/DAY16/nts/DAY16_00_LENA_MORNING_NTS.json","stepIndex":55,"from":"lena","expectedText":"This morning, then some work with my group after lunch","day":16,"contactId":"lena","labelId":"university","label":"University","periodId":"morning"},
    {"id":"lena-group-16-nts","storyPath":"story/DAY16/nts/DAY16_00_LENA_MORNING_NTS.json","stepIndex":55,"from":"lena","expectedText":"This morning, then some work with my group after lunch","day":16,"contactId":"lena","labelId":"group_work","label":"Group project","periodId":"after_lunch"},
    {"id":"lena-university-17-ntr","storyPath":"story/DAY17/ntr/DAY17_00_LENA_MORNING_NTR.json","stepIndex":45,"from":"lena","expectedText":"Yeah, then straight to work","day":17,"contactId":"lena","labelId":"university","label":"University","periodId":"morning","requiredAnnouncements":[{"storyPath":"story/DAY17/ntr/DAY17_00_LENA_MORNING_NTR.json","stepIndex":44,"from":"player","expectedText":"Classes this morning again?"}]},
    {"id":"lena-work-17-ntr","storyPath":"story/DAY17/ntr/DAY17_00_LENA_MORNING_NTR.json","stepIndex":45,"from":"lena","expectedText":"Yeah, then straight to work","day":17,"contactId":"lena","labelId":"work","label":"Work","periodId":"after_classes"},
    {"id":"lena-university-17-nts","storyPath":"story/DAY17/nts/DAY17_00_LENA_MORNING_NTS.json","stepIndex":57,"from":"lena","expectedText":"I'll talk to him properly after class, before I give myself another excuse","day":17,"contactId":"lena","labelId":"university","label":"University"},
    {"id":"lena-work-18-ntr","storyPath":"story/DAY17/ntr/DAY17_02_LENA_NIGHT_NTR.json","stepIndex":118,"from":"lena","expectedText":"I checked tomorrow's hours before I left today. I finish at five","day":18,"contactId":"lena","labelId":"work","label":"Work","periodId":"until","periodMinute":1020,"alsoAnnouncedBy":[{"storyPath":"story/DAY18/ntr/DAY18_00_LENA_MORNING_NTR.json","stepIndex":28,"from":"lena","expectedText":"Yeah, I finish at five. I'll stop on the way and come straight over"}]},
    {"id":"lena-group-18-nts","storyPath":"story/DAY18/nts/DAY18_00_LENA_MORNING_NTS.json","stepIndex":15,"from":"lena","expectedText":"I have the group meeting this morning, then I'll come home and get changed","day":18,"contactId":"lena","labelId":"group_work","label":"Group project","periodId":"morning","alsoAnnouncedBy":[{"storyPath":"story/DAY18/nts/DAY18_01_LENA_AFTERNOON_NTS.json","stepIndex":5,"from":"lena","expectedText":"The group meeting finished on time, so I even managed a proper lunch"}]},
    {"id":"lena-university-19-ntr","storyPath":"story/DAY19/ntr/DAY19_00_LENA_MORNING_NTR.json","stepIndex":15,"from":"lena","expectedText":"Class first, then work. I'm just getting ready","day":19,"contactId":"lena","labelId":"university","label":"University"},
    {"id":"lena-work-19-ntr","storyPath":"story/DAY19/ntr/DAY19_00_LENA_MORNING_NTR.json","stepIndex":15,"from":"lena","expectedText":"Class first, then work. I'm just getting ready","day":19,"contactId":"lena","labelId":"work","label":"Work","periodId":"around_end","initialPeriodId":"after_classes","periodMinute":1020,"periodAnnouncedBy":{"storyPath":"story/DAY19/ntr/DAY19_00_LENA_MORNING_NTR.json","stepIndex":31,"from":"lena","expectedText":"I should finish at five again, then straight home"}},
    {"id":"lena-no-shift-19-nts","storyPath":"story/DAY19/nts/DAY19_00_LENA_MORNING_NTS.json","stepIndex":2,"from":"lena","expectedText":"It is 😌 No shift, no rushing anywhere this morning","day":19,"contactId":"lena","labelId":"no_shift","label":"No work shift","periodId":"morning"},
    {"id":"lena-university-20-ntr","storyPath":"story/DAY20/ntr/DAY20_00_LENA_MORNING_NTR.json","stepIndex":17,"from":"lena","expectedText":"Classes, then work. I'm going home before dinner tonight","day":20,"contactId":"lena","labelId":"university","label":"University"},
    {"id":"lena-work-20-ntr","storyPath":"story/DAY20/ntr/DAY20_00_LENA_MORNING_NTR.json","stepIndex":17,"from":"lena","expectedText":"Classes, then work. I'm going home before dinner tonight","day":20,"contactId":"lena","labelId":"work","label":"Work","periodId":"after_classes"},
    {"id":"lena-work-20-nts","storyPath":"story/DAY20/nts/DAY20_00_LENA_MORNING_NTS.json","stepIndex":6,"from":"lena","expectedText":"Until six, then I need to pick up a couple of things on the way home","day":20,"contactId":"lena","labelId":"work","label":"Work","periodId":"until","periodMinute":1080,"requiredAnnouncements":[{"storyPath":"story/DAY20/nts/DAY20_00_LENA_MORNING_NTS.json","stepIndex":5,"from":"player","expectedText":"Work today?"}]},
    {"id":"evelyn-bar-4","storyPath":"story/DAY3/DAY3_07_EVELYN_AFTERNOON_LAUNDRY.json","stepIndex":6,"from":"evelyn","expectedText":"Also, don’t forget. I start work again tomorrow","day":4,"contactId":"evelyn","labelId":"bar_shift","label":"Bar shift","alsoAnnouncedBy":[{"storyPath":"story/DAY4/DAY4_06_EVELYN_16H_GOING_TO_WORK.json","stepIndex":9,"from":"evelyn","expectedText":"I might be back late"}]},
    {"id":"evelyn-bar-6","storyPath":"story/DAY6/DAY6_08_EVELYN_16H_GOING_TO_WORK.json","stepIndex":1,"from":"evelyn","expectedText":"I am heading there now","day":6,"contactId":"evelyn","labelId":"bar_shift","label":"Bar shift"},
    {"id":"evelyn-bar-7","storyPath":"story/DAY7/DAY7_07_EVELYN_16H_SUPPORT.json","stepIndex":3,"from":"evelyn","expectedText":"But I will stay focused on my work","day":7,"contactId":"evelyn","labelId":"bar_shift","label":"Bar shift"},
    {"id":"evelyn-bar-8-ntr","storyPath":"story/DAY8/DAY8_08_EVELYN_16H_GOING_TO_WORK_IF_NTR.json","stepIndex":0,"from":"evelyn","expectedText":"I am leaving now","day":8,"contactId":"evelyn","labelId":"bar_shift","label":"Bar shift","branchPath":["then",1],"route":"ntr"},
    {"id":"evelyn-bar-11-ntr","storyPath":"story/DAY11/ntr/DAY11_02_EVELYN_EVENING_NTR.json","stepIndex":9,"from":"evelyn","expectedText":"I will 😊","day":11,"contactId":"evelyn","labelId":"bar_shift","label":"Bar shift","periodId":"evening","requiredAnnouncements":[{"storyPath":"story/DAY11/ntr/DAY11_02_EVELYN_EVENING_NTR.json","stepIndex":8,"from":"player","expectedText":"Then try to enjoy the shift with your coworkers"}]},
    {"id":"evelyn-bar-12-ntr","storyPath":"story/DAY12/ntr/DAY12_01_EVELYN_AFTERNOON_NTR.json","stepIndex":15,"from":"evelyn","expectedText":"Since my manager is working tonight, I'm back to my usual schedule","day":12,"contactId":"evelyn","labelId":"bar_shift","label":"Bar shift","periodId":"evening"},
    {"id":"evelyn-bar-13-ntr","storyPath":"story/DAY13/ntr/DAY13_02_EVELYN_EVENING_NTR.json","stepIndex":7,"from":"evelyn","expectedText":"I'd like a quiet shift for once 😅","day":13,"contactId":"evelyn","labelId":"bar_shift","label":"Bar shift","periodId":"evening"},
    {"id":"evelyn-bar-14-ntr","storyPath":"story/DAY14/ntr/DAY14_02_EVELYN_EVENING_NTR.json","stepIndex":10,"from":"evelyn","expectedText":"Anyway, I need to leave for work","day":14,"contactId":"evelyn","labelId":"bar_shift","label":"Bar shift","periodId":"evening"},
    {"id":"evelyn-bar-15-ntr","storyPath":"story/DAY15/ntr/DAY15_01_EVELYN_AFTERNOON_NTR.json","stepIndex":15,"from":"evelyn","expectedText":"I'm going to get ready for work","day":15,"contactId":"evelyn","labelId":"bar_shift","label":"Bar shift"},
    {"id":"hailey-school-7","storyPath":"story/DAY7/DAY7_05_HAILEY_UNI_EXTRA_CLASS.json","stepIndex":4,"from":"hailey","expectedText":"I have an extra class tonight with my main teacher because I messed up my exams","day":7,"contactId":"hailey","labelId":"extra_class","label":"Extra class","periodId":"evening"},
    {"id":"hailey-rugby-2","storyPath":"story/DAY2/DAY2_05_HAILEY_RUGBY.json","stepIndex":21,"from":"hailey","expectedText":"I dropped a girl at training and she cried a little 😭","day":2,"contactId":"hailey","labelId":"training","label":"Training","periodId":"in_hour","periodAnnouncedBy":{"storyPath":"story/DAY2/DAY2_05_HAILEY_RUGBY.json","stepIndex":32,"from":"hailey","expectedText":"In one hour 😇"}},
    {"id":"hailey-study-9-love","storyPath":"story/DAY9/love/DAY9_01_HAILEY_MORNING_LOVE.json","stepIndex":16,"from":"hailey","expectedText":"Study date after lunch","day":9,"contactId":"hailey","labelId":"study","label":"Study session","periodId":"after_lunch"},
    {"id":"hailey-study-10-ntr","storyPath":"story/DAY9/ntr/DAY9_01_HAILEY_MORNING_NTR.json","stepIndex":11,"from":"hailey","expectedText":"He said I can stay after class and he will go through the assignment with me","day":10,"contactId":"hailey","labelId":"study","label":"Study session","periodId":"after_classes"},
    {"id":"hailey-school-11-love","storyPath":"story/DAY11/love/DAY11_00_HAILEY_MORNING_LOVE.json","stepIndex":1,"from":"hailey","expectedText":"I am outside class","day":11,"contactId":"hailey","labelId":"school","label":"Classes"},
    {"id":"hailey-school-11-ntr","storyPath":"story/DAY11/ntr/DAY11_00_HAILEY_MORNING_NTR.json","stepIndex":1,"from":"hailey","expectedText":"I am outside class","day":11,"contactId":"hailey","labelId":"school","label":"Classes"},
    {"id":"hailey-school-11-nts","storyPath":"story/DAY11/nts/DAY11_00_HAILEY_MORNING_NTS.json","stepIndex":2,"from":"hailey","expectedText":"I'm officially on my way to school","day":11,"contactId":"hailey","labelId":"school","label":"Classes"},
    {"id":"hailey-school-12-love","storyPath":"story/DAY12/love/DAY12_00_HAILEY_MORNING_LOVE.json","stepIndex":15,"from":"hailey","expectedText":"Two classes","day":12,"contactId":"hailey","labelId":"school","label":"Classes"},
    {"id":"hailey-school-12-ntr","storyPath":"story/DAY12/ntr/DAY12_00_HAILEY_MORNING_NTR.json","stepIndex":6,"from":"hailey","expectedText":"Two classes today","day":12,"contactId":"hailey","labelId":"school","label":"Classes"},
    {"id":"hailey-school-12-nts","storyPath":"story/DAY12/nts/DAY12_01_HAILEY_AFTERNOON_NTS.json","stepIndex":7,"from":"hailey","expectedText":"I understood a few things in class today that would've completely confused me last week","day":12,"contactId":"hailey","labelId":"school","label":"Classes"},
    {"id":"hailey-school-13-love","storyPath":"story/DAY13/love/DAY13_01_HAILEY_AFTERNOON_LOVE.json","stepIndex":1,"from":"hailey","expectedText":"Morning classes survived","day":13,"contactId":"hailey","labelId":"school","label":"Classes","periodId":"morning"},
    {"id":"hailey-school-13-ntr","storyPath":"story/DAY13/ntr/DAY13_00_HAILEY_MORNING_NTR.json","stepIndex":11,"from":"hailey","expectedText":"Apparently I have to come revise with him after class instead","day":13,"contactId":"hailey","labelId":"school","label":"Classes"},
    {"id":"hailey-revision-13-ntr","storyPath":"story/DAY13/ntr/DAY13_00_HAILEY_MORNING_NTR.json","stepIndex":11,"from":"hailey","expectedText":"Apparently I have to come revise with him after class instead","day":13,"contactId":"hailey","labelId":"revision","label":"Revision","periodId":"after_classes"},
    {"id":"hailey-school-13-nts","storyPath":"story/DAY13/nts/DAY13_00_HAILEY_MORNING_NTS.json","stepIndex":25,"from":"hailey","expectedText":"I'll text you after class","day":13,"contactId":"hailey","labelId":"school","label":"Classes"},
    {"id":"hailey-study-14-nts","storyPath":"story/DAY14/nts/DAY14_00_HAILEY_MORNING_NTS.json","stepIndex":3,"from":"hailey","expectedText":"We need to study at school for tomorrow's final exam","day":14,"contactId":"hailey","labelId":"study","label":"Study session"},
    {"id":"hailey-school-15-love","storyPath":"story/DAY15/love/DAY15_00_HAILEY_MORNING_LOVE.json","stepIndex":5,"from":"hailey","expectedText":"Only two morning classes","day":15,"contactId":"hailey","labelId":"school","label":"Classes","periodId":"morning","cancelledBy":{"storyPath":"story/DAY15/love/DAY15_00_HAILEY_MORNING_LOVE.json","stepIndex":8,"from":"hailey","expectedText":"So I am skipping them 😌"}},
    {"id":"hailey-school-15-ntr","storyPath":"story/DAY15/ntr/DAY15_00_HAILEY_MORNING_NTR.json","stepIndex":4,"from":"hailey","expectedText":"Only two morning classes","day":15,"contactId":"hailey","labelId":"school","label":"Classes","periodId":"morning","cancelledBy":{"storyPath":"story/DAY15/ntr/DAY15_00_HAILEY_MORNING_NTR.json","stepIndex":2,"from":"hailey","expectedText":"I am not going to class"}},
    {"id":"mason-gym-2","storyPath":"story/DAY2/DAY2_10_MASON_REPLY.json","stepIndex":2,"from":"mason","expectedText":"I was at the gym","day":2,"contactId":"mason","labelId":"gym","label":"Gym session","durationMinutes":120,"durationAnnouncedBy":{"storyPath":"story/DAY2/DAY2_10_MASON_REPLY.json","stepIndex":5,"from":"mason","expectedText":"Yeah","requiredAnnouncements":[{"storyPath":"story/DAY2/DAY2_10_MASON_REPLY.json","stepIndex":4,"from":"player","expectedText":"For two hours"}]}},
    {"id":"mason-gym-4","storyPath":"story/DAY4/DAY4_09_MASON_GYM_LATE_RETURN.json","stepIndex":1,"from":"mason","expectedText":"Stopped at the gym on the way back","day":4,"contactId":"mason","labelId":"gym","label":"Gym session"},
    {"id":"mason-work-8","storyPath":"story/DAY8/DAY8_05_MASON_NORMAL_DAY_TEXT.json","stepIndex":12,"from":"mason","expectedText":"I'm going to work","day":8,"contactId":"mason","labelId":"work","label":"Work","periodId":"around_end","periodMinute":1080,"periodAnnouncedBy":{"storyPath":"story/DAY8/DAY8_10_MASON_NEEDS_ANSWER.json","stepIndex":11,"from":"mason","expectedText":"I finish work around 6"}},
    {"id":"mason-work-9-love","storyPath":"story/DAY9/love/DAY9_05_MASON_AFTERNOON_LOVE.json","stepIndex":15,"from":"mason","expectedText":"Almost done at work","day":9,"contactId":"mason","labelId":"work","label":"Work"},
    {"id":"mason-gym-9-ntr","storyPath":"story/DAY9/ntr/DAY9_06_MASON_AFTERNOON_NTR.json","stepIndex":1,"from":"mason","expectedText":"I'm about to leave for the gym","day":9,"contactId":"mason","labelId":"gym","label":"Gym session","periodId":"afternoon"},
    {"id":"mason-no-shift-11-love","storyPath":"story/DAY11/love/DAY11_00_MASON_MORNING_LOVE.json","stepIndex":10,"from":"mason","expectedText":"And luckily, I'm not working today","day":11,"contactId":"mason","labelId":"no_shift","label":"No work shift","periodId":"all_day"},
    {"id":"mason-gym-11-ntr","storyPath":"story/DAY11/ntr/DAY11_01_MASON_AFTERNOON_NTR.json","stepIndex":11,"from":"mason","expectedText":"I'm at the gym","day":11,"contactId":"mason","labelId":"gym","label":"Gym session","periodId":"afternoon"},
    {"id":"mason-work-12-love","storyPath":"story/DAY12/love/DAY12_00_MASON_MORNING_LOVE.json","stepIndex":15,"from":"mason","expectedText":"And I work this afternoon","day":12,"contactId":"mason","labelId":"work","label":"Work","periodId":"afternoon"},
    {"id":"mason-work-13-nts","storyPath":"story/DAY12/nts/DAY12_02_MASON_EVENING_NTS.json","stepIndex":15,"from":"mason","expectedText":"I have work","day":13,"contactId":"mason","labelId":"work","label":"Work","periodId":"morning"},
    {"id":"mason-gym-13-ntr","storyPath":"story/DAY13/ntr/DAY13_01_MASON_AFTERNOON_NTR.json","stepIndex":1,"from":"mason","expectedText":"I'm heading to the gym","day":13,"contactId":"mason","labelId":"gym","label":"Gym session","periodId":"afternoon"},
    {"id":"mason-work-14-love","storyPath":"story/DAY14/love/DAY14_01_MASON_AFTERNOON_LOVE.json","stepIndex":8,"from":"mason","expectedText":"I finish work early today","day":14,"contactId":"mason","labelId":"work","label":"Work"},
    {"id":"mason-work-15-ntr","storyPath":"story/DAY14/ntr/DAY14_02_MASON_EVENING_NTR.json","stepIndex":3,"from":"mason","expectedText":"Morning shift","day":15,"contactId":"mason","labelId":"work","label":"Work","periodId":"morning"},
    {"id":"mason-no-shift-15-love","storyPath":"story/DAY15/love/DAY15_01_MASON_AFTERNOON_LOVE.json","stepIndex":1,"from":"mason","expectedText":"I'm not working today","day":15,"contactId":"mason","labelId":"no_shift","label":"No work shift","periodId":"all_day"},
    {"id":"aiden-training-14","storyPath":"story/DAY14/DAY14_00_AIDEN_SHARED.json","stepIndex":3,"from":"aiden","expectedText":"Training is back","day":14,"contactId":"aiden","labelId":"training","label":"Training"}
  ].map(row => Object.freeze({...row, requireExpectedText: true}));
  return Object.freeze({version: 9, firstWeekday: 4, plans: Object.freeze(plans), routines: Object.freeze(routines)});
});
