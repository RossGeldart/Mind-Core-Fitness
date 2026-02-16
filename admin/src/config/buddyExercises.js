/**
 * Complete exercise library for AI Buddy.
 * Only exercises with a storagePath (video demo) should be used in generated programmes.
 */

const BUDDY_EXERCISES = [
  // ─── PUSH ────────────────────────────────────────
  { name: 'Dumbbell Floor Press', type: 'weighted', equipment: 'dumbbells', group: 'push', pbKey: 'chestPress', storagePath: 'exercises/dumbbells/upper/dumbbell floor press.mp4' },
  { name: 'Seated Dumbbell Shoulder Press', type: 'weighted', equipment: 'dumbbells', group: 'push', pbKey: 'shoulderPress', storagePath: 'exercises/dumbbells/upper/seated dumbbell shoulder press.mp4' },
  { name: 'Seated Dumbbell Arnold Press', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: 'exercises/dumbbells/upper/seated dumbbell arnold press.mp4' },
  { name: 'Dumbbell Overhead Tricep Extension', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: 'exercises/dumbbells/upper/dumbbell overhead tricep extension.mp4' },
  { name: 'Skullcrushers', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: 'exercises/dumbbells/upper/skullcrushers.mp4' },
  { name: 'Dumbbell Lateral Raise', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: 'exercises/dumbbells/upper/dumbbell lateral raise.mp4' },
  { name: 'Dumbbell Front Raise', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: 'exercises/dumbbells/upper/dumbbell front raise.mp4' },
  { name: 'Press Up', type: 'reps', equipment: 'bodyweight', group: 'push', storagePath: 'exercises/bodyweight/upper/press up.mp4' },
  { name: 'Tricep Dips', type: 'reps', equipment: 'bodyweight', group: 'push', storagePath: 'exercises/bodyweight/upper/tricep dips.mp4' },
  { name: 'Pike Push Ups', type: 'reps', equipment: 'bodyweight', group: 'push', storagePath: 'exercises/bodyweight/upper/pike push ups.GIF' },
  { name: 'Reverse Plank', type: 'timed', equipment: 'bodyweight', group: 'push', storagePath: 'exercises/bodyweight/upper/reverse plank.GIF' },
  // Push — no video (browse only)
  { name: 'Dumbbell Squeeze Press', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: null },
  { name: 'Incline Dumbbell Press', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: null },
  { name: 'Dumbbell Pullover', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: null },
  { name: 'Dumbbell Fly', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: null },
  { name: 'Tricep Kickback', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: null },
  { name: 'Dumbbell Shrug', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: null },
  { name: 'Dumbbell Y-Raise', type: 'weighted', equipment: 'dumbbells', group: 'push', storagePath: null },
  { name: 'Wide Press Up', type: 'reps', equipment: 'bodyweight', group: 'push', storagePath: null },
  { name: 'Diamond Press Up', type: 'reps', equipment: 'bodyweight', group: 'push', storagePath: null },
  { name: 'Decline Press Up', type: 'reps', equipment: 'bodyweight', group: 'push', storagePath: null },
  { name: 'Wall Walks', type: 'reps', equipment: 'bodyweight', group: 'push', storagePath: null },
  { name: 'Press Up Hold', type: 'timed', equipment: 'bodyweight', group: 'push', storagePath: null },
  { name: 'Shoulder Tap Hold', type: 'timed', equipment: 'bodyweight', group: 'push', storagePath: null },

  // ─── PULL ────────────────────────────────────────
  { name: 'Dumbbell Bent Over Row', type: 'weighted', equipment: 'dumbbells', group: 'pull', pbKey: 'seatedRow', storagePath: 'exercises/dumbbells/upper/dumbbell bent over row.mp4' },
  { name: 'Single Arm Bent Over Row', type: 'weighted', equipment: 'dumbbells', group: 'pull', storagePath: 'exercises/dumbbells/upper/single arm bent over row.mp4' },
  { name: 'Bicep Curl', type: 'weighted', equipment: 'dumbbells', group: 'pull', storagePath: 'exercises/dumbbells/upper/bicep curl.mp4' },
  { name: 'Hammer Curl', type: 'weighted', equipment: 'dumbbells', group: 'pull', storagePath: 'exercises/dumbbells/upper/hammer curl.mp4' },
  { name: 'Dumbbell Bent Over Rear Delt Fly', type: 'weighted', equipment: 'dumbbells', group: 'pull', storagePath: 'exercises/dumbbells/upper/dumbbell bent over rear delt fly.mp4' },
  { name: 'Renegade Row', type: 'weighted', equipment: 'dumbbells', group: 'pull', storagePath: 'exercises/dumbbells/upper/renegade row.mp4' },
  // Pull — no video (browse only)
  { name: 'Wide Dumbbell Bent Over Row', type: 'weighted', equipment: 'dumbbells', group: 'pull', storagePath: null },
  { name: 'Reverse Fly', type: 'weighted', equipment: 'dumbbells', group: 'pull', storagePath: null },
  { name: 'Concentration Curl', type: 'weighted', equipment: 'dumbbells', group: 'pull', storagePath: null },
  { name: 'Wide Grip Bicep Curl', type: 'weighted', equipment: 'dumbbells', group: 'pull', storagePath: null },
  { name: 'Wrist Curl', type: 'weighted', equipment: 'dumbbells', group: 'pull', storagePath: null },
  { name: 'Prone Y-T-W Raises', type: 'reps', equipment: 'bodyweight', group: 'pull', storagePath: null },
  { name: 'Reverse Snow Angel', type: 'reps', equipment: 'bodyweight', group: 'pull', storagePath: null },
  { name: 'Isometric Bicep Hold', type: 'timed', equipment: 'bodyweight', group: 'pull', storagePath: null },

  // ─── LOWER ───────────────────────────────────────
  { name: 'Dumbbell Goblet Squats', type: 'weighted', equipment: 'dumbbells', group: 'lower', pbKey: 'squat', storagePath: 'exercises/dumbbells/lower/dumbbell goblet squats.mp4' },
  { name: 'Romanian Deadlifts', type: 'weighted', equipment: 'dumbbells', group: 'lower', pbKey: 'deadlift', storagePath: 'exercises/dumbbells/lower/romanian deadlifts.GIF' },
  { name: 'Forward Dumbbell Lunges', type: 'weighted', equipment: 'dumbbells', group: 'lower', storagePath: 'exercises/dumbbells/lower/forward dumbbell lunges.GIF' },
  { name: 'Dumbbell Sumo Squats', type: 'weighted', equipment: 'dumbbells', group: 'lower', storagePath: 'exercises/dumbbells/lower/dumbbell sumo squats.GIF' },
  { name: 'Weighted Calf Raises', type: 'weighted', equipment: 'dumbbells', group: 'lower', storagePath: 'exercises/dumbbells/lower/weighted calf raises.GIF' },
  { name: '1 Legged RDL', type: 'weighted', equipment: 'dumbbells', group: 'lower', storagePath: 'exercises/dumbbells/lower/1 legged rdl.GIF' },
  { name: 'Dumbbell Box Step Ups', type: 'weighted', equipment: 'dumbbells', group: 'lower', storagePath: 'exercises/dumbbells/lower/dumbbell box step ups.mp4' },
  { name: 'Dumbbell Squat Pulses', type: 'weighted', equipment: 'dumbbells', group: 'lower', storagePath: 'exercises/dumbbells/lower/dumbbell squat pulses.GIF' },
  { name: 'Dumbbell Reverse Lunges', type: 'weighted', equipment: 'dumbbells', group: 'lower', storagePath: 'exercises/dumbbells/lower/dumbbell reverse lunges.GIF' },
  { name: 'Kettlebell Romanian Deadlift', type: 'weighted', equipment: 'kettlebell', group: 'lower', storagePath: 'exercises/kettlebells/lower/kettlebell romanian deadlift.mp4' },
  { name: 'Reverse Lunge', type: 'reps', equipment: 'bodyweight', group: 'lower', storagePath: 'exercises/bodyweight/lower/reverse lunge.GIF' },
  { name: 'Box Step Ups', type: 'reps', equipment: 'bodyweight', group: 'lower', storagePath: 'exercises/bodyweight/lower/box step ups.GIF' },
  { name: 'Bulgarian Split Squats', type: 'reps', equipment: 'bodyweight', group: 'lower', storagePath: 'exercises/bodyweight/lower/bulgarian split squats.GIF' },
  { name: 'Jump Squats', type: 'reps', equipment: 'bodyweight', group: 'lower', storagePath: 'exercises/bodyweight/lower/jump squats.GIF' },
  { name: 'Hip Thrusts', type: 'reps', equipment: 'bodyweight', group: 'lower', storagePath: 'exercises/bodyweight/lower/hip thrusts.GIF' },
  { name: 'Donkey Kicks', type: 'reps', equipment: 'bodyweight', group: 'lower', storagePath: 'exercises/bodyweight/lower/donkey kicks.GIF' },
  { name: 'Skater Jumps', type: 'reps', equipment: 'bodyweight', group: 'lower', storagePath: 'exercises/bodyweight/lower/skater jumps.GIF' },
  { name: 'Squat And Hold', type: 'timed', equipment: 'bodyweight', group: 'lower', storagePath: 'exercises/bodyweight/lower/squat and hold.GIF' },

  // ─── CORE ────────────────────────────────────────
  { name: 'Forearm Plank', type: 'timed', equipment: 'bodyweight', group: 'core', pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
  { name: 'Side Plank', type: 'timed', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Side Plank.mp4' },
  { name: 'Hollow Body Hold', type: 'timed', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Hollow Body Hold.mp4' },
  { name: 'Superman Hold', type: 'timed', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Superman Hold.mp4' },
  { name: 'Mountain Climbers', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Mountain Climbers.mp4' },
  { name: 'Fast Mountain Climbers', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Fast Mountain Climbers.mp4' },
  { name: 'Cross Body Mountain Climbers', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Cross Body Mountain Climbers.mp4' },
  { name: 'Russian Twist', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Russian Twist.mp4' },
  { name: 'Crunch', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Crunch.mp4' },
  { name: 'Bicycle Crunch', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Bicycle Crunch.mp4' },
  { name: 'Leg Raises', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Leg Raises.mp4' },
  { name: 'Dead Bug', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Dead Bug.mp4' },
  { name: 'Dead Bug Single Leg Drop', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Dead Bug Single Leg Drop.mp4' },
  { name: 'Bird Dog', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Bird Dog.mp4' },
  { name: 'Flutter Kicks', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Flutter Kicks.mp4' },
  { name: 'Hollow Hold Flutter Kicks', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Hollow Hold Flutter Kicks.mp4' },
  { name: 'High Plank Shoulder Taps', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/High Plank Shoulder Taps.mp4' },
  { name: 'Hip Dips Plank', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Hip Dips Plank.mp4' },
  { name: 'Single Leg V-Up', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Single Leg V-Up.mp4' },
  { name: 'Hollow Hold To V-Sit', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Hollow Hold To V-sit.mp4' },
  { name: 'Toe Reaches', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/toe reaches.GIF' },
  { name: 'Side Plank Rotation', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Side Plank Rotation.mp4' },
  { name: 'Plank Walkout', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Plank Walkout.mp4' },
  { name: 'Reverse Crunch To Leg Raise', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Reverse Crunch To Leg Raise.mp4' },
  { name: 'Burpee', type: 'reps', equipment: 'bodyweight', group: 'core', storagePath: 'exercises/bodyweight/core/Burpee.mp4' },
  { name: 'Russian Twists Dumbbell', type: 'weighted', equipment: 'dumbbells', group: 'core', storagePath: 'exercises/dumbbells/core/russian twists dumbbell.GIF' },
  { name: 'Kettlebell Russian Twist', type: 'weighted', equipment: 'kettlebell', group: 'core', storagePath: 'exercises/kettlebells/core/kettlebell russian twist.mp4' },
  { name: 'Kettlebell Side Bends', type: 'weighted', equipment: 'kettlebell', group: 'core', storagePath: 'exercises/kettlebells/core/kettlebell side bends.mp4' },
  { name: 'Kneeling Kettlebell Halo', type: 'weighted', equipment: 'kettlebell', group: 'core', storagePath: 'exercises/kettlebells/core/kneeling kettlebell halo.mp4' },
  { name: 'Kettlebell Bird Dog Drag', type: 'reps', equipment: 'kettlebell', group: 'core', storagePath: 'exercises/kettlebells/core/kettlebell bird dog drag.mp4' },
  // Core — no video (browse only)
  { name: 'Back Extension Hold', type: 'timed', equipment: 'bodyweight', group: 'core', storagePath: null },
  { name: 'Dumbbell Plank Pull Through', type: 'weighted', equipment: 'dumbbells', group: 'core', storagePath: null },
];

/** Exercises that have video demos — use these for AI-generated programmes */
export const PROGRAMMABLE_EXERCISES = BUDDY_EXERCISES.filter(e => e.storagePath !== null);

/** All exercises including browse-only */
export default BUDDY_EXERCISES;
