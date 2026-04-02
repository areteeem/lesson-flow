const ADJECTIVES = [
  'Brave', 'Bright', 'Calm', 'Clever', 'Cool', 'Daring', 'Eager', 'Fair',
  'Fast', 'Gentle', 'Happy', 'Jolly', 'Keen', 'Kind', 'Lively', 'Lucky',
  'Merry', 'Mighty', 'Noble', 'Neat', 'Proud', 'Quick', 'Quiet', 'Ready',
  'Sharp', 'Shy', 'Smart', 'Smooth', 'Snowy', 'Soft', 'Steady', 'Strong',
  'Sure', 'Swift', 'Tidy', 'True', 'Warm', 'Wise', 'Wild', 'Young',
  'Agile', 'Bold', 'Cosmic', 'Dapper', 'Epic', 'Free', 'Grand', 'Hardy',
  'Iron', 'Jade', 'Keen', 'Lunar', 'Maple', 'Nova', 'Open', 'Pine',
  'Rapid', 'Royal', 'Rustic', 'Sage', 'Solar', 'Sonic', 'Stellar', 'Storm',
  'Sunny', 'Teal', 'Ultra', 'Vivid', 'Witty', 'Zen', 'Arctic', 'Aspen',
  'Azure', 'Berry', 'Blaze', 'Cedar', 'Cloud', 'Coral', 'Crisp', 'Dawn',
  'Ember', 'Fern', 'Frost', 'Gleam', 'Glow', 'Granite', 'Hazel', 'Ivy',
  'Jasper', 'Lake', 'Meadow', 'Misty', 'Ocean', 'Olive', 'Opal', 'Pearl',
  'Plum', 'Rain', 'Reed', 'Ridge', 'River', 'Robin', 'Sandy', 'Sierra',
  'Silver', 'Sky', 'Slate', 'Stone', 'Terra', 'Timber', 'Velvet', 'Wave',
];

const ANIMALS = [
  'Falcon', 'Otter', 'Penguin', 'Fox', 'Owl', 'Dolphin', 'Hawk', 'Panda',
  'Wolf', 'Eagle', 'Heron', 'Lynx', 'Bear', 'Deer', 'Crane', 'Finch',
  'Koala', 'Raven', 'Swan', 'Tiger', 'Rabbit', 'Sparrow', 'Seal', 'Dove',
  'Badger', 'Bison', 'Bobcat', 'Cardinal', 'Cheetah', 'Cobra', 'Condor',
  'Cougar', 'Coyote', 'Dragon', 'Egret', 'Elk', 'Ferret', 'Gecko', 'Goose',
  'Gorilla', 'Grouse', 'Guppy', 'Hippo', 'Ibis', 'Iguana', 'Impala',
  'Jackal', 'Jaguar', 'Jay', 'Kiwi', 'Lark', 'Lemur', 'Lion', 'Llama',
  'Macaw', 'Manta', 'Meerkat', 'Moose', 'Newt', 'Oriole', 'Osprey',
  'Panther', 'Parrot', 'Pelican', 'Piper', 'Puma', 'Quail', 'Raccoon',
  'Salmon', 'Shark', 'Sloth', 'Snail', 'Stork', 'Toucan', 'Trout',
  'Turtle', 'Viper', 'Walrus', 'Whale', 'Wren', 'Yak', 'Zebra',
];

export function generateNickname() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj} ${animal}`;
}
