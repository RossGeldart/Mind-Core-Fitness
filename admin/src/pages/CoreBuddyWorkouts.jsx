import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, query, where, getDocs, doc, getDoc, setDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { storage, db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTier } from '../contexts/TierContext';
import PullToRefresh from '../components/PullToRefresh';
import './CoreBuddyWorkouts.css';
import CoreBuddyNav from '../components/CoreBuddyNav';
import WorkoutCelebration from '../components/WorkoutCelebration';
import generateShareImage from '../utils/generateShareImage';
import BADGE_DEFS from '../utils/badgeConfig';
import randomiserCardImg from '../assets/images/cards/randomiser.jpg';
import programmeCardImg from '../assets/programme-card-workout.webp';
import progFullbody4wkImg from '../assets/images/cards/prog-fullbody-4wk.jpg';
import mgArmsImg from '../assets/muscle-group-arms.png';
import armsBicepImg from '../assets/arms-bicep.png';
import armsTricepImg from '../assets/arms-tricep.png';
import armsFullArmsImg from '../assets/arms-full-arms.png';
import mgChestImg from '../assets/muscle-group-chest.png';
import chestStrengthImg from '../assets/chest-strength.png';
import chestHypertrophyImg from '../assets/chest-hypertrophy.png';
import chestEnduranceImg from '../assets/chest-endurance.png';
import mgShouldersImg from '../assets/muscle-group-shoulders.png';
import shouldersStrengthImg from '../assets/shoulders-strength.png';
import shouldersHypertrophyImg from '../assets/shoulders-hypertrophy.png';
import shouldersEnduranceImg from '../assets/shoulders-endurance.png';
import { TICKS_78_94, TICKS_82_94 } from '../utils/ringTicks';

const TICK_COUNT = 60;
const WEEKLY_TARGET = 5;

// Volume milestones for badge tracking
const VOLUME_MILESTONES = [
  { threshold: 1000, label: '1 Tonne' },
  { threshold: 5000, label: '5 Tonne' },
  { threshold: 10000, label: '10 Tonne' },
  { threshold: 25000, label: '25 Tonne' },
  { threshold: 50000, label: '50 Tonne' },
  { threshold: 100000, label: '100 Tonne' },
  { threshold: 250000, label: '250 Tonne' },
  { threshold: 500000, label: '500 Tonne' },
  { threshold: 1000000, label: '1 Million kg' },
];

// Exercise group mapping for badge categorisation
const EXERCISE_GROUPS = {
  'Dumbbell Floor Press': 'push', 'Seated Dumbbell Shoulder Press': 'push', 'Seated Dumbbell Arnold Press': 'push',
  'Dumbbell Overhead Tricep Extension': 'push', 'Skullcrushers': 'push', 'Dumbbell Lateral Raise': 'push',
  'Dumbbell Front Raise': 'push', 'Dumbbell Squeeze Press': 'push', 'Incline Dumbbell Press': 'push',
  'Dumbbell Fly': 'push', 'Dumbbell Pullover': 'push', 'Tricep Kickback': 'push',
  'Dumbbell Shrug': 'push', 'Dumbbell Y-Raise': 'push',
  'Dumbbell Bent Over Row': 'pull', 'Single Arm Bent Over Row': 'pull', 'Bicep Curl': 'pull',
  'Hammer Curl': 'pull', 'Dumbbell Bent Over Rear Delt Fly': 'pull', 'Renegade Row': 'pull',
  'Wide Dumbbell Bent Over Row': 'pull', 'Reverse Fly': 'pull', 'Concentration Curl': 'pull',
  'Wide Grip Bicep Curl': 'pull', 'Wrist Curl': 'pull',
  'Dumbbell Goblet Squats': 'lower', 'Romanian Deadlifts': 'lower', 'Forward Dumbbell Lunges': 'lower',
  'Dumbbell Sumo Squats': 'lower', 'Weighted Calf Raises': 'lower', '1 Legged RDL': 'lower',
  'Dumbbell Box Step Ups': 'lower', 'Dumbbell Squat Pulses': 'lower', 'Dumbbell Reverse Lunges': 'lower',
  'Kettlebell Romanian Deadlift': 'lower',
  'Russian Twists Dumbbell': 'core', 'Kettlebell Russian Twist': 'core', 'Kettlebell Side Bends': 'core',
  'Kneeling Kettlebell Halo': 'core', 'Kettlebell Bird Dog Drag': 'core',
};

// Programme templates (must match CoreBuddyProgrammes / CoreBuddyDashboard)
const TEMPLATE_META = {
  fullbody_4wk: { duration: 4, daysPerWeek: 3 },
  fullbody_8wk: { duration: 8, daysPerWeek: 3 },
  fullbody_12wk: { duration: 12, daysPerWeek: 3 },
  core_4wk: { duration: 4, daysPerWeek: 3 },
  core_8wk: { duration: 8, daysPerWeek: 3 },
  core_12wk: { duration: 12, daysPerWeek: 3 },
  upper_4wk: { duration: 4, daysPerWeek: 3 },
  lower_4wk: { duration: 4, daysPerWeek: 3 },
};

// Focus-based gradient tints for programme hero cards
const FOCUS_GRADIENTS = {
  fullbody: 'linear-gradient(160deg, rgba(153,49,60,0.15) 0%, rgba(153,49,60,0.35) 30%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.88) 80%, rgba(0,0,0,0.95) 100%)',
  core: 'linear-gradient(160deg, rgba(30,80,120,0.2) 0%, rgba(30,80,120,0.35) 30%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.88) 80%, rgba(0,0,0,0.95) 100%)',
  upper: 'linear-gradient(160deg, rgba(100,60,140,0.2) 0%, rgba(100,60,140,0.35) 30%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.88) 80%, rgba(0,0,0,0.95) 100%)',
  lower: 'linear-gradient(160deg, rgba(40,120,80,0.2) 0%, rgba(40,120,80,0.35) 30%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.88) 80%, rgba(0,0,0,0.95) 100%)',
};

// Muscle-group gradient tints
const MUSCLE_GRADIENTS = {
  arms: 'linear-gradient(160deg, rgba(180,60,60,0.2) 0%, rgba(180,60,60,0.35) 30%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.9) 80%, rgba(0,0,0,0.96) 100%)',
  chest: 'linear-gradient(160deg, rgba(50,100,160,0.2) 0%, rgba(50,100,160,0.35) 30%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.9) 80%, rgba(0,0,0,0.96) 100%)',
  back: 'linear-gradient(160deg, rgba(80,130,60,0.2) 0%, rgba(80,130,60,0.35) 30%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.9) 80%, rgba(0,0,0,0.96) 100%)',
  shoulders: 'linear-gradient(160deg, rgba(160,100,40,0.2) 0%, rgba(160,100,40,0.35) 30%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.9) 80%, rgba(0,0,0,0.96) 100%)',
  legs: 'linear-gradient(160deg, rgba(100,50,140,0.2) 0%, rgba(100,50,140,0.35) 30%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.9) 80%, rgba(0,0,0,0.96) 100%)',
  core: 'linear-gradient(160deg, rgba(30,80,120,0.2) 0%, rgba(30,80,120,0.35) 30%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.9) 80%, rgba(0,0,0,0.96) 100%)',
};

// Programme cards for carousel display
const PROGRAMME_CARDS = [
  { id: 'fullbody_4wk', name: '4-Week Full Body', focus: 'fullbody', duration: 4, level: 'All Levels', daysPerWeek: 3, image: progFullbody4wkImg },
  { id: 'fullbody_8wk', name: '8-Week Full Body', focus: 'fullbody', duration: 8, level: 'Intermediate', daysPerWeek: 3 },
  { id: 'fullbody_12wk', name: '12-Week Full Body', focus: 'fullbody', duration: 12, level: 'Advanced', daysPerWeek: 3 },
  { id: 'core_4wk', name: '4-Week Core', focus: 'core', duration: 4, level: 'Beginner', daysPerWeek: 3 },
  { id: 'core_8wk', name: '8-Week Core', focus: 'core', duration: 8, level: 'Intermediate', daysPerWeek: 3 },
  { id: 'core_12wk', name: '12-Week Core', focus: 'core', duration: 12, level: 'Advanced', daysPerWeek: 3 },
  { id: 'upper_4wk', name: '4-Week Upper Body', focus: 'upper', duration: 4, level: 'Intermediate', daysPerWeek: 3 },
  { id: 'lower_4wk', name: '4-Week Lower Body', focus: 'lower', duration: 4, level: 'Intermediate', daysPerWeek: 3 },
];

// Focus icons for programme cards
const FOCUS_ICONS = {
  fullbody: 'M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zm-2 8h4l1 4h2l-1 4h-2l-1 4h-2l-1-4H8l-1-4h2l1-4z',
  core: 'M12 2a4 4 0 0 1 4 4v1h-2V6a2 2 0 1 0-4 0v1H8V6a4 4 0 0 1 4-4zM8 9h8v2H8V9zm-1 4h10l-1 9H8l-1-9z',
  upper: 'M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zm8 10l-3-1.5c-.5-.25-1-.5-1.5-.5h-7c-.5 0-1 .25-1.5.5L4 12l-2 6h4l1.5 4h9L18 18h4l-2-6z',
  lower: 'M16.5 3A2.5 2.5 0 0 0 14 5.5 2.5 2.5 0 0 0 16.5 8 2.5 2.5 0 0 0 19 5.5 2.5 2.5 0 0 0 16.5 3zM14 9l-3 7h2l1 6h2l1-6h2l-3-7h-2z',
};

// Muscle group placeholders
const MUSCLE_GROUPS = [
  { key: 'arms', label: 'Arms', icon: 'M7 5h2v14H7V5zm8 0h2v14h-2V5zm-5 4h4v6h-4V9z', image: mgArmsImg },
  { key: 'chest', label: 'Chest', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15H9v-2h2v2zm4 0h-2v-2h2v2zm3-6c0 1.1-.36 2.12-.97 2.95l-.87-.87C16.7 12.53 17 11.8 17 11c0-2.76-2.24-5-5-5S7 8.24 7 11c0 .8.3 1.53.84 2.08l-.87.87A4.977 4.977 0 0 1 6 11c0-3.31 2.69-6 6-6s6 2.69 6 6z', image: mgChestImg },
  { key: 'back', label: 'Back', icon: 'M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zm4 18H8v-6l-4-4 1.41-1.41L8 11.17V8h8v3.17l2.59-2.58L20 10l-4 4v6z' },
  { key: 'shoulders', label: 'Shoulders', icon: 'M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zm8 10l-3-1.5c-.5-.25-1-.5-1.5-.5h-7c-.5 0-1 .25-1.5.5L4 12l-2 6h4l1.5 4h9L18 18h4l-2-6z', image: mgShouldersImg },
  { key: 'legs', label: 'Legs', icon: 'M16.5 3A2.5 2.5 0 0 0 14 5.5 2.5 2.5 0 0 0 16.5 8 2.5 2.5 0 0 0 19 5.5 2.5 2.5 0 0 0 16.5 3zM14 9l-3 7h2l1 6h2l1-6h2l-3-7h-2z' },
  { key: 'core', label: 'Core', icon: 'M12 2a4 4 0 0 1 4 4v1h-2V6a2 2 0 1 0-4 0v1H8V6a4 4 0 0 1 4-4zM8 9h8v2H8V9zm-1 4h10l-1 9H8l-1-9z' },
];

// Muscle group workout sessions (3 per group)
const MUSCLE_GROUP_SESSIONS = {
  chest: [
    {
      id: 'chest_strength', name: 'Chest Strength', desc: 'Heavy pressing for max strength',
      image: chestStrengthImg,
      level: 'Intermediate',
      overview: 'A heavy pressing session designed to build raw chest strength. Focus on controlled negatives and powerful pressing movements.',
      tips: [
        'Go heavy \u2014 pick a weight where the last 2 reps are a real challenge',
        'Control the negative (lowering phase) for 2-3 seconds',
        'Keep your shoulder blades squeezed together throughout all pressing movements',
        'Rest 90-120 seconds between sets to allow full recovery',
      ],
      exercises: [
        { name: 'Dumbbell Floor Press', type: 'weighted', sets: 4, reps: 8, storagePath: 'exercises/dumbbells/upper/dumbbell floor press.mp4' },
        { name: 'Dumbbell Squeeze Press', type: 'weighted', sets: 3, reps: 10, storagePath: null },
        { name: 'Incline Dumbbell Press', type: 'weighted', sets: 3, reps: 10, storagePath: null },
        { name: 'Dumbbell Pullover', type: 'weighted', sets: 3, reps: 12, storagePath: null },
        { name: 'Dumbbell Fly', type: 'weighted', sets: 3, reps: 12, storagePath: null },
      ],
    },
    {
      id: 'chest_hypertrophy', name: 'Chest Hypertrophy', desc: 'Volume training for muscle growth',
      image: chestHypertrophyImg,
      level: 'Intermediate',
      overview: 'A high-volume chest session focused on time under tension and muscle growth. Lighter weights, more reps, and slow controlled movements.',
      tips: [
        'Use moderate weight \u2014 you should feel the burn by rep 10',
        'Squeeze your chest at the top of every rep for 1 second',
        'Keep rest periods short at 60-90 seconds to keep the pump going',
        'On press ups, go to failure on the final set',
      ],
      exercises: [
        { name: 'Dumbbell Floor Press', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/dumbbell floor press.mp4' },
        { name: 'Wide Press Up', type: 'reps', sets: 3, reps: 15, storagePath: null },
        { name: 'Dumbbell Fly', type: 'weighted', sets: 3, reps: 12, storagePath: null },
        { name: 'Incline Dumbbell Press', type: 'weighted', sets: 3, reps: 12, storagePath: null },
        { name: 'Press Up', type: 'reps', sets: 3, reps: 20, storagePath: 'exercises/bodyweight/upper/press up.mp4' },
      ],
    },
    {
      id: 'chest_endurance', name: 'Chest Endurance', desc: 'Bodyweight pushing to failure',
      image: chestEnduranceImg,
      level: 'All Levels',
      overview: 'No weights needed. This bodyweight-only session builds chest endurance and muscular stamina through high-rep push up variations.',
      tips: [
        'Focus on full range of motion \u2014 chest to floor on every rep',
        'Keep your core tight and body in a straight line throughout',
        'Scale down to knee press ups if you can\'t maintain form',
        'Push through the burn \u2014 the last 5 reps are where the growth happens',
      ],
      exercises: [
        { name: 'Press Up', type: 'reps', sets: 4, reps: 20, storagePath: 'exercises/bodyweight/upper/press up.mp4' },
        { name: 'Wide Press Up', type: 'reps', sets: 3, reps: 15, storagePath: null },
        { name: 'Diamond Press Up', type: 'reps', sets: 3, reps: 12, storagePath: null },
        { name: 'Decline Press Up', type: 'reps', sets: 3, reps: 15, storagePath: null },
        { name: 'Press Up Hold', type: 'timed', sets: 3, time: 30, storagePath: null },
      ],
    },
  ],
  back: [
    {
      id: 'back_strength', name: 'Back Strength', desc: 'Heavy rows for a thick back',
      level: 'Intermediate',
      overview: 'Build a thick, powerful back with heavy rowing movements. This session targets your lats, rhomboids, and traps for overall back development.',
      tips: [
        'Go heavy on rows \u2014 use a weight that challenges you by rep 6-8',
        'Drive your elbows back and squeeze your shoulder blades together at the top',
        'Keep a slight bend in your knees and hinge at the hips for bent over movements',
        'Rest 90-120 seconds between sets for full recovery',
      ],
      exercises: [
        { name: 'Dumbbell Bent Over Row', type: 'weighted', sets: 4, reps: 8, storagePath: 'exercises/dumbbells/upper/dumbbell bent over row.mp4' },
        { name: 'Single Arm Bent Over Row', type: 'weighted', sets: 3, reps: 10, storagePath: 'exercises/dumbbells/upper/single arm bent over row.mp4' },
        { name: 'Dumbbell Bent Over Rear Delt Fly', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/dumbbell bent over rear delt fly.mp4' },
        { name: 'Dumbbell Pullover', type: 'weighted', sets: 3, reps: 12, storagePath: null },
        { name: 'Dumbbell Shrug', type: 'weighted', sets: 3, reps: 15, storagePath: null },
      ],
    },
    {
      id: 'back_hypertrophy', name: 'Back Hypertrophy', desc: 'Width and thickness volume work',
      level: 'Intermediate',
      overview: 'A volume-focused back session combining rows and isolation moves to build width and thickness. Focus on the mind-muscle connection.',
      tips: [
        'Use moderate weight \u2014 feel the stretch and squeeze on every rep',
        'On renegade rows, keep your hips square to the floor and avoid rotating',
        'For reverse flys, use lighter weight and focus on squeezing your rear delts',
        'Keep rest to 60-90 seconds to maintain intensity',
      ],
      exercises: [
        { name: 'Renegade Row', type: 'weighted', sets: 3, reps: 10, storagePath: 'exercises/dumbbells/upper/renegade row.mp4' },
        { name: 'Wide Dumbbell Bent Over Row', type: 'weighted', sets: 3, reps: 12, storagePath: null },
        { name: 'Single Arm Bent Over Row', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/single arm bent over row.mp4' },
        { name: 'Reverse Fly', type: 'weighted', sets: 3, reps: 15, storagePath: null },
        { name: 'Prone Y-T-W Raises', type: 'reps', sets: 3, reps: 10, storagePath: null },
      ],
    },
    {
      id: 'back_endurance', name: 'Back Endurance', desc: 'Bodyweight back conditioning',
      level: 'All Levels',
      overview: 'A bodyweight session to strengthen your posterior chain and improve posture. Great for back health, mobility, and muscular endurance.',
      tips: [
        'On superman holds, lift your arms and legs simultaneously and hold tight',
        'Focus on slow, controlled movements \u2014 quality over speed',
        'Breathe steadily throughout timed holds \u2014 don\'t hold your breath',
        'Engage your glutes and lower back together on every movement',
      ],
      exercises: [
        { name: 'Superman Hold', type: 'timed', sets: 4, time: 30, storagePath: 'exercises/bodyweight/upper/Superman Hold.mp4' },
        { name: 'Prone Y-T-W Raises', type: 'reps', sets: 3, reps: 12, storagePath: null },
        { name: 'Reverse Snow Angel', type: 'reps', sets: 3, reps: 12, storagePath: null },
        { name: 'Bird Dog', type: 'reps', sets: 3, reps: 12, storagePath: 'exercises/bodyweight/core/Bird Dog.mp4' },
        { name: 'Back Extension Hold', type: 'timed', sets: 3, time: 30, storagePath: null },
      ],
    },
  ],
  shoulders: [
    {
      id: 'shoulders_strength', name: 'Shoulder Strength', desc: 'Heavy pressing for boulder shoulders',
      image: shouldersStrengthImg,
      level: 'Intermediate',
      overview: 'A heavy overhead pressing session to build strong, powerful shoulders. Compound movements first, followed by isolation work for all three delt heads.',
      tips: [
        'Go heavy on presses \u2014 pick a weight where you struggle on the last 2 reps',
        'Brace your core and avoid arching your back during overhead movements',
        'Press straight up and control the weight down slowly',
        'Rest 90-120 seconds between pressing sets, 60 seconds for isolation moves',
      ],
      exercises: [
        { name: 'Seated Dumbbell Shoulder Press', type: 'weighted', sets: 4, reps: 8, storagePath: 'exercises/dumbbells/upper/seated dumbbell shoulder press.mp4' },
        { name: 'Seated Dumbbell Arnold Press', type: 'weighted', sets: 3, reps: 10, storagePath: 'exercises/dumbbells/upper/seated dumbbell arnold press.mp4' },
        { name: 'Dumbbell Front Raise', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/dumbbell front raise.mp4' },
        { name: 'Dumbbell Bent Over Rear Delt Fly', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/dumbbell bent over rear delt fly.mp4' },
        { name: 'Dumbbell Shrug', type: 'weighted', sets: 3, reps: 15, storagePath: null },
      ],
    },
    {
      id: 'shoulders_hypertrophy', name: 'Shoulder Hypertrophy', desc: 'Volume and isolation for 3D delts',
      image: shouldersHypertrophyImg,
      level: 'Intermediate',
      overview: 'A high-volume session targeting all three heads of the deltoid for that 3D capped shoulder look. Moderate weight, high reps, constant tension.',
      tips: [
        'Use lighter weight than you think \u2014 shoulders respond best to high reps',
        'On lateral raises, lead with your elbows and don\'t swing the weight',
        'Pause at the top of each raise for a 1-second squeeze',
        'Keep rest periods at 60 seconds to maximise the pump',
      ],
      exercises: [
        { name: 'Seated Dumbbell Arnold Press', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/seated dumbbell arnold press.mp4' },
        { name: 'Dumbbell Lateral Raise', type: 'weighted', sets: 4, reps: 15, storagePath: 'exercises/dumbbells/upper/dumbbell lateral raise.mp4' },
        { name: 'Dumbbell Front Raise', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/dumbbell front raise.mp4' },
        { name: 'Dumbbell Bent Over Rear Delt Fly', type: 'weighted', sets: 3, reps: 15, storagePath: 'exercises/dumbbells/upper/dumbbell bent over rear delt fly.mp4' },
        { name: 'Dumbbell Y-Raise', type: 'weighted', sets: 3, reps: 12, storagePath: null },
      ],
    },
    {
      id: 'shoulders_endurance', name: 'Shoulder Endurance', desc: 'Bodyweight and high-rep work',
      image: shouldersEnduranceImg,
      level: 'All Levels',
      overview: 'A shoulder endurance session combining bodyweight movements with high-rep dumbbell work. Builds stamina, stability, and shoulder resilience.',
      tips: [
        'On pike push ups, walk your feet close to your hands to increase the angle',
        'For high-rep lateral raises, use a very light weight and focus on form',
        'Wall walks are advanced \u2014 scale to pike push ups if needed',
        'Keep your core braced throughout to protect your lower back',
      ],
      exercises: [
        { name: 'Pike Push Ups', type: 'reps', sets: 4, reps: 12, storagePath: 'exercises/bodyweight/upper/pike push ups.mp4' },
        { name: 'Dumbbell Lateral Raise', type: 'weighted', sets: 3, reps: 20, storagePath: 'exercises/dumbbells/upper/dumbbell lateral raise.mp4' },
        { name: 'Wall Walks', type: 'reps', sets: 3, reps: 6, storagePath: null },
        { name: 'Prone Y-T-W Raises', type: 'reps', sets: 3, reps: 10, storagePath: null },
        { name: 'Shoulder Tap Hold', type: 'timed', sets: 3, time: 30, storagePath: null },
      ],
    },
  ],
  arms: [
    {
      id: 'arms_bicep', name: 'Bicep Focus', desc: 'Curl variations for peak biceps', image: armsBicepImg,
      level: 'All Levels',
      overview: 'An arm session dedicated entirely to biceps. Multiple curl variations target different parts of the bicep for maximum peak and thickness.',
      tips: [
        'Keep your elbows pinned to your sides \u2014 no swinging',
        'Control the negative (lowering) for 2-3 seconds on every rep',
        'Start with your heaviest weight and decrease as you fatigue',
        'Squeeze hard at the top of each curl for a full contraction',
      ],
      exercises: [
        { name: 'Bicep Curl', type: 'weighted', sets: 4, reps: 10, storagePath: 'exercises/dumbbells/upper/bicep curl.mp4' },
        { name: 'Hammer Curl', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/hammer curl.mp4' },
        { name: 'Concentration Curl', type: 'weighted', sets: 3, reps: 12, storagePath: null },
        { name: 'Wide Grip Bicep Curl', type: 'weighted', sets: 3, reps: 12, storagePath: null },
        { name: 'Isometric Bicep Hold', type: 'timed', sets: 3, time: 20, storagePath: null },
      ],
    },
    {
      id: 'arms_tricep', name: 'Tricep Focus', desc: 'Extensions and dips for horseshoe triceps', image: armsTricepImg,
      level: 'All Levels',
      overview: 'All-out tricep training with extensions, dips, and pressing movements. The triceps make up two-thirds of your arm \u2014 this session builds serious size.',
      tips: [
        'On overhead extensions, keep your elbows close to your head',
        'For skullcrushers, lower the weight slowly to just above your forehead',
        'On dips, lean slightly forward to reduce shoulder strain',
        'Full lockout at the top of every extension for maximum tricep contraction',
      ],
      exercises: [
        { name: 'Dumbbell Overhead Tricep Extension', type: 'weighted', sets: 4, reps: 10, storagePath: 'exercises/dumbbells/upper/dumbbell overhead tricep extension.mp4' },
        { name: 'Skullcrushers', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/skullcrushers.mp4' },
        { name: 'Tricep Dips', type: 'reps', sets: 3, reps: 15, storagePath: 'exercises/bodyweight/upper/tricep dips.mp4' },
        { name: 'Tricep Kickback', type: 'weighted', sets: 3, reps: 12, storagePath: null },
        { name: 'Diamond Press Up', type: 'reps', sets: 3, reps: 12, storagePath: null },
      ],
    },
    {
      id: 'arms_full', name: 'Full Arms', desc: 'Superset biceps and triceps', image: armsFullArmsImg,
      level: 'All Levels',
      overview: 'A balanced arm session alternating between biceps and triceps. Superset style keeps the intensity high and maximises the pump.',
      tips: [
        'Superset each pair \u2014 do biceps then immediately hit triceps',
        'Use moderate weight that lets you maintain strict form for all reps',
        'Rest 60 seconds after each superset pair',
        'Focus on the squeeze at the peak contraction of every rep',
      ],
      exercises: [
        { name: 'Bicep Curl', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/bicep curl.mp4' },
        { name: 'Tricep Kickback', type: 'weighted', sets: 3, reps: 12, storagePath: null },
        { name: 'Hammer Curl', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/hammer curl.mp4' },
        { name: 'Dumbbell Overhead Tricep Extension', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/upper/dumbbell overhead tricep extension.mp4' },
        { name: 'Wrist Curl', type: 'weighted', sets: 3, reps: 15, storagePath: null },
      ],
    },
  ],
  legs: [
    {
      id: 'legs_quad', name: 'Quad Dominant', desc: 'Squats and lunges for quad power',
      level: 'All Levels',
      overview: 'A quad-focused leg session built around squats and lunges. Heavy compound movements to build strong, powerful quads and overall leg strength.',
      tips: [
        'On goblet squats, hold the dumbbell close to your chest and sit deep',
        'Keep your knees tracking over your toes \u2014 don\'t let them cave inward',
        'Drive through your heels on all squatting movements',
        'Rest 90-120 seconds between heavy sets, 60 seconds on bodyweight moves',
      ],
      exercises: [
        { name: 'Dumbbell Goblet Squats', type: 'weighted', sets: 4, reps: 10, storagePath: 'exercises/dumbbells/lower/dumbbell goblet squats.mp4' },
        { name: 'Forward Dumbbell Lunges', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/lower/forward dumbbell lunges.mp4' },
        { name: 'Dumbbell Squat Pulses', type: 'weighted', sets: 3, reps: 15, storagePath: 'exercises/dumbbells/lower/dumbbell squat pulses.mp4' },
        { name: 'Bulgarian Split Squats', type: 'reps', sets: 3, reps: 12, storagePath: 'exercises/bodyweight/lower/bulgarian split squats.mp4' },
        { name: 'Squat And Hold', type: 'timed', sets: 3, time: 30, storagePath: 'exercises/bodyweight/lower/squat and hold.mp4' },
      ],
    },
    {
      id: 'legs_ham_glute', name: 'Hamstring & Glute', desc: 'Posterior chain focus',
      level: 'Intermediate',
      overview: 'Target the back of your legs with deadlift and hip hinge variations. This session builds a strong posterior chain \u2014 hamstrings, glutes, and lower back.',
      tips: [
        'On RDLs, push your hips back and feel the stretch in your hamstrings',
        'Keep a slight bend in your knees throughout hip hinge movements',
        'Squeeze your glutes hard at the top of every rep',
        'For single leg work, start with your weaker side first',
      ],
      exercises: [
        { name: 'Romanian Deadlifts', type: 'weighted', sets: 4, reps: 10, storagePath: 'exercises/dumbbells/lower/romanian deadlifts.mp4' },
        { name: '1 Legged RDL', type: 'weighted', sets: 3, reps: 10, storagePath: 'exercises/dumbbells/lower/1 legged rdl.mp4' },
        { name: 'Hip Thrusts', type: 'reps', sets: 3, reps: 15, storagePath: 'exercises/bodyweight/lower/hip thrusts.mp4' },
        { name: 'Dumbbell Sumo Squats', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/lower/dumbbell sumo squats.mp4' },
        { name: 'Donkey Kicks', type: 'reps', sets: 3, reps: 15, storagePath: 'exercises/bodyweight/lower/donkey kicks.mp4' },
      ],
    },
    {
      id: 'legs_power', name: 'Power & Plyo', desc: 'Explosive leg training',
      level: 'Intermediate',
      overview: 'An explosive leg session combining plyometrics with weighted movements. Build power, speed, and athletic performance.',
      tips: [
        'On jump squats, land softly with bent knees to absorb the impact',
        'Explode up on every rep \u2014 power comes from speed, not just weight',
        'Keep rest periods at 60-90 seconds to maintain intensity',
        'Focus on landing mechanics \u2014 knees out, chest up, soft landing',
      ],
      exercises: [
        { name: 'Jump Squats', type: 'reps', sets: 4, reps: 12, storagePath: 'exercises/bodyweight/lower/jump squats.mp4' },
        { name: 'Dumbbell Box Step Ups', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/lower/dumbbell box step ups.mp4' },
        { name: 'Skater Jumps', type: 'reps', sets: 3, reps: 15, storagePath: 'exercises/bodyweight/lower/skater jumps.mp4' },
        { name: 'Dumbbell Reverse Lunges', type: 'weighted', sets: 3, reps: 12, storagePath: 'exercises/dumbbells/lower/dumbbell reverse lunges.mp4' },
        { name: 'Weighted Calf Raises', type: 'weighted', sets: 4, reps: 15, storagePath: 'exercises/dumbbells/lower/weighted calf raises.mp4' },
      ],
    },
  ],
  core: [
    {
      id: 'core_lower_abs', name: 'Lower Abs Blast', desc: '40s work / 20s rest — 3 rounds',
      level: 'Intermediate',
      overview: 'An interval-based core burner targeting the lower abdominals. 40 seconds of work followed by 20 seconds of rest — keep the intensity high and your lower back pressed into the floor throughout.',
      tips: [
        'Press your lower back firmly into the floor on every rep',
        'Exhale hard as you contract your abs — don\'t hold your breath',
        'If your lower back lifts off the ground, reduce the range of motion',
        'Focus on slow, controlled movements rather than speed',
      ],
      interval: true, rounds: 3, work: 40, rest: 20,
      exercises: [
        { name: 'Leg Raises', storagePath: 'exercises/bodyweight/core/Leg Raises.mp4' },
        { name: 'Reverse Crunch To Leg Raise', storagePath: 'exercises/bodyweight/core/Reverse Crunch To Leg Raise.mp4' },
        { name: 'Flutter Kicks', storagePath: 'exercises/bodyweight/core/Flutter Kicks.mp4' },
        { name: 'Dead Bug Single Leg Drop', storagePath: 'exercises/bodyweight/core/Dead Bug Single Leg Drop.mp4' },
        { name: 'Hollow Body Hold', storagePath: 'exercises/bodyweight/core/Hollow Body Hold.mp4' },
        { name: 'Hollow Hold Flutter Kicks', storagePath: 'exercises/bodyweight/core/Hollow Hold Flutter Kicks.mp4' },
      ],
    },
    {
      id: 'core_obliques', name: 'Obliques & Rotation', desc: '35s work / 25s rest — 3 rounds',
      level: 'Intermediate',
      overview: 'Target the obliques and rotational core muscles with this interval session. 35 seconds of work with 25 seconds rest — every exercise involves twisting, rotating, or side-bracing movements.',
      tips: [
        'Rotate from your ribcage, not just your arms',
        'Keep your hips as still as possible during twisting exercises',
        'Brace your core before each movement — think about squeezing a belt',
        'On side planks, stack your hips and push the floor away',
      ],
      interval: true, rounds: 3, work: 35, rest: 25,
      exercises: [
        { name: 'Russian Twist', storagePath: 'exercises/bodyweight/core/Russian Twist.mp4' },
        { name: 'Side Plank Rotation', storagePath: 'exercises/bodyweight/core/Side Plank Rotation.mp4' },
        { name: 'Cross Body Mountain Climbers', storagePath: 'exercises/bodyweight/core/Cross Body Mountain Climbers.mp4' },
        { name: 'Hip Dips Plank', storagePath: 'exercises/bodyweight/core/Hip Dips Plank.mp4' },
        { name: 'Bicycle Crunch', storagePath: 'exercises/bodyweight/core/Bicycle Crunch.mp4' },
        { name: 'Side Plank', storagePath: 'exercises/bodyweight/core/Side Plank.mp4' },
      ],
    },
    {
      id: 'core_weighted', name: 'Weighted Core', desc: '40s work / 20s rest — 3 rounds',
      level: 'Advanced',
      overview: 'Add resistance to your core training with dumbbells and kettlebells. 40 seconds of weighted work followed by 20 seconds rest — this session builds serious core strength and stability.',
      tips: [
        'Start with a moderate weight — form is more important than load',
        'Brace your entire core before picking up the weight each round',
        'Keep movements controlled — no swinging or using momentum',
        'If grip fails before core does, go slightly lighter next time',
      ],
      interval: true, rounds: 3, work: 40, rest: 20,
      exercises: [
        { name: 'Russian Twists Dumbbell', storagePath: 'exercises/dumbbells/core/russian twists dumbbell.mp4' },
        { name: 'Kettlebell Russian Twist', storagePath: 'exercises/kettlebells/core/kettlebell russian twist.mp4' },
        { name: 'Kettlebell Side Bends', storagePath: 'exercises/kettlebells/core/kettlebell side bends.mp4' },
        { name: 'Kneeling Kettlebell Halo', storagePath: 'exercises/kettlebells/core/kneeling kettlebell halo.mp4' },
        { name: 'Kettlebell Bird Dog Drag', storagePath: 'exercises/kettlebells/core/kettlebell bird dog drag.mp4' },
        { name: 'Dumbbell Plank Pull Through', storagePath: null },
      ],
    },
  ],
};

const EQUIPMENT = [
  { key: 'bodyweight', label: 'Bodyweight', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z' },
  { key: 'dumbbells', label: 'Dumbbells', icon: 'M1 9h2v6H1V9zm3-2h2v10H4V7zm3 4h10v2H7v-2zm10-4h2v10h-2V7zm3 2h2v6h-2V9z' },
  { key: 'kettlebells', label: 'Kettlebells', icon: 'M12 2C9.24 2 7 4.24 7 7c0 1.1.36 2.12.97 2.95C6.76 11.08 6 12.96 6 15c0 3.87 2.69 7 6 7s6-3.13 6-7c0-2.04-.76-3.92-1.97-5.05.61-.83.97-1.85.97-2.95 0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z' },
];

const FOCUS_AREAS = [
  { key: 'core', label: 'Core', icon: 'M12 2a4 4 0 0 1 4 4v1h-2V6a2 2 0 1 0-4 0v1H8V6a4 4 0 0 1 4-4zM8 9h8v2H8V9zm-1 4h10l-1 9H8l-1-9z' },
  { key: 'upper', label: 'Upper', icon: 'M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zm8 10l-3-1.5c-.5-.25-1-.5-1.5-.5h-7c-.5 0-1 .25-1.5.5L4 12l-2 6h4l1.5 4h9L18 18h4l-2-6z' },
  { key: 'lower', label: 'Lower', icon: 'M16.5 3A2.5 2.5 0 0 0 14 5.5 2.5 2.5 0 0 0 16.5 8 2.5 2.5 0 0 0 19 5.5 2.5 2.5 0 0 0 16.5 3zM14 9l-3 7h2l1 6h2l1-6h2l-3-7h-2z' },
  { key: 'fullbody', label: 'Full Body', icon: 'M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zm-2 8h4l1 4h2l-1 4h-2l-1 4h-2l-1-4H8l-1-4h2l1-4z' },
  { key: 'mix', label: 'Mix It Up', icon: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm-.83 9.41l-1.42 1.42L17.96 20.54l1.42-1.42-5.71-5.71z' },
];

const LEVELS = [
  { key: 'beginner', label: 'Beginner', work: 30, rest: 30, desc: '30s work / 30s rest' },
  { key: 'intermediate', label: 'Intermediate', work: 40, rest: 20, desc: '40s work / 20s rest' },
  { key: 'advanced', label: 'Advanced', work: 40, rest: 15, desc: '40s work / 15s rest' },
];

const TIME_OPTIONS = [5, 10, 15, 20, 30];

function toTitleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CoreBuddyWorkouts() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme, accent } = useTheme();
  const { isPremium, FREE_RANDOMISER_DURATIONS, FREE_RANDOMISER_WEEKLY_LIMIT } = useTier();
  const navigate = useNavigate();

  // Views: 'menu' | 'setup' | 'spinning' | 'preview' | 'countdown' | 'workout' | 'complete'
  //        | 'muscle_sessions' | 'muscle_overview' | 'muscle_workout' | 'muscle_complete'
  const [view, setView] = useState('menu');

  // Setup
  const [selectedEquipment, setSelectedEquipment] = useState(['bodyweight']);
  const [focusArea, setFocusArea] = useState('core');
  const [level, setLevel] = useState('intermediate');
  const [duration, setDuration] = useState(isPremium ? 15 : 5);

  // Exercises from Firebase Storage
  const [allExercises, setAllExercises] = useState([]);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const loadingRef = useRef(false);
  const exercisesRef = useRef([]);

  // Generated workout
  const [workout, setWorkout] = useState([]); // [{ name, videoUrl }]
  const [rounds, setRounds] = useState(2);
  const [levelConfig, setLevelConfig] = useState(LEVELS[1]);

  // Active workout state
  const [currentRound, setCurrentRound] = useState(1);
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [phase, setPhase] = useState('work'); // 'work' | 'rest'
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [startCountdown, setStartCountdown] = useState(0);

  // Hold-to-finish overlay
  const [showFinish, setShowFinish] = useState(false);
  const [showMgFinish, setShowMgFinish] = useState(false);

  // Quick-preview modal for exercise thumbnails
  const [previewEx, setPreviewEx] = useState(null);

  // GIF looping
  const gifRef = useRef(null);

  // Audio
  const beepRef = useRef(null);
  const goRef = useRef(null);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Share to Journey helper — accepts structured data or plain text
  const shareToJourney = useCallback(async (data) => {
    if (!clientData) throw new Error('Not signed in');
    const isStructured = data && typeof data === 'object' && data.type;
    await addDoc(collection(db, 'posts'), {
      authorId: clientData.id,
      authorName: clientData.name || 'Unknown',
      authorPhotoURL: clientData.photoURL || null,
      content: isStructured ? '' : data,
      type: isStructured ? data.type : 'text',
      imageURL: null,
      createdAt: serverTimestamp(),
      likeCount: 0,
      commentCount: 0,
      ...(isStructured ? { metadata: { title: data.title || '', subtitle: data.subtitle || '', stats: data.stats || [], quote: data.quote || '', badges: data.badges || [] } } : {}),
    });
  }, [clientData]);

  // Muscle group workout state
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState(null);
  const [selectedMuscleSession, setSelectedMuscleSession] = useState(null);
  const [mgExIdx, setMgExIdx] = useState(0);
  const [mgSetIdx, setMgSetIdx] = useState(0);
  const [mgLogs, setMgLogs] = useState([]);
  const [mgWeightInput, setMgWeightInput] = useState('');
  const [mgRepsInput, setMgRepsInput] = useState('');
  const [mgTimerActive, setMgTimerActive] = useState(false);
  const [mgTimerValue, setMgTimerValue] = useState(0);
  const [mgVideoPlaying, setMgVideoPlaying] = useState(false);
  const [mgVideoUrls, setMgVideoUrls] = useState({});
  const mgVideoRef = useRef(null);
  const mgTimerRef = useRef(null);
  const [mgSessionBadges, setMgSessionBadges] = useState([]);
  const [mgBadgeCelebration, setMgBadgeCelebration] = useState(null);

  // Workout stats
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [programmeWeeklyCount, setProgrammeWeeklyCount] = useState(0);
  const [programmePct, setProgrammePct] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [levelBreakdown, setLevelBreakdown] = useState({ beginner: 0, intermediate: 0, advanced: 0 });

  // Free-tier gating: limit available durations and weekly usage
  const availableTimeOptions = isPremium ? TIME_OPTIONS : TIME_OPTIONS.filter(t => FREE_RANDOMISER_DURATIONS.includes(t));
  const freeRandomiserLimitReached = !isPremium && weeklyCount >= FREE_RANDOMISER_WEEKLY_LIMIT;

  // Active programme info (for the "Continue Programme" card)
  const [activeProgrammeId, setActiveProgrammeId] = useState(null);
  const [activeProgrammeName, setActiveProgrammeName] = useState('');
  const [statsLoaded, setStatsLoaded] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load workout stats
  useEffect(() => {
    if (!currentUser || !clientData) return;
    const loadStats = async () => {
      try {
        const logsRef = collection(db, 'workoutLogs');
        const q = query(logsRef, where('clientId', '==', clientData.id));
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => d.data());

        const randomiserDocs = docs.filter(d => d.type !== 'programme');
        setTotalCount(randomiserDocs.length);

        // Total minutes (randomiser only)
        const mins = randomiserDocs.reduce((sum, d) => sum + (d.duration || 0), 0);
        setTotalMinutes(mins);

        // Level breakdown (randomiser only)
        const levels = { beginner: 0, intermediate: 0, advanced: 0 };
        randomiserDocs.forEach(d => { if (d.level && levels[d.level] !== undefined) levels[d.level]++; });
        setLevelBreakdown(levels);

        // Weekly count (Monday-based)
        const now = new Date();
        const day = now.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayOffset);
        monday.setHours(0, 0, 0, 0);
        const mondayMs = monday.getTime();

        const weekly = docs.filter(d => {
          const ts = d.completedAt;
          if (!ts) return false;
          const ms = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
          return ms >= mondayMs;
        });
        setWeeklyCount(weekly.filter(d => d.type !== 'programme').length);

        // Programme: weekly count + overall progress
        let progCount = 0;
        if (clientData) {
          try {
            const progSnap = await getDoc(doc(db, 'clientProgrammes', clientData.id));
            if (progSnap.exists()) {
              const prog = progSnap.data();
              const activeTemplateId = prog.templateId;
              progCount = weekly.filter(d => d.type === 'programme' && d.programmeId === activeTemplateId).length;
              // Store active programme info for the "Continue" card
              setActiveProgrammeId(activeTemplateId);
              const progCard = PROGRAMME_CARDS.find(p => p.id === activeTemplateId);
              if (progCard) setActiveProgrammeName(progCard.name);
              // Overall programme progress (matches dashboard calculation)
              const meta = TEMPLATE_META[activeTemplateId];
              if (meta) {
                const completed = Object.keys(prog.completedSessions || {}).length;
                const total = meta.duration * meta.daysPerWeek;
                setProgrammePct(total > 0 ? Math.round((completed / total) * 100) : 0);
              }
            } else {
              setActiveProgrammeId(null);
              setActiveProgrammeName('');
              setProgrammePct(0);
            }
          } catch (e) {
            // Fallback: no active programme, show 0
          }
        }
        setProgrammeWeeklyCount(progCount);

        // Streak: consecutive weeks (going backwards) with at least 1 randomiser workout
        const timestamps = randomiserDocs
          .map(d => d.completedAt)
          .filter(Boolean)
          .map(ts => ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime())
          .sort((a, b) => b - a);

        if (timestamps.length === 0) {
          setStreak(0);
        } else {
          // Build set of ISO week keys (YYYY-WW) for each workout
          const weekKeys = new Set();
          timestamps.forEach(ms => {
            const d = new Date(ms);
            const dayOfWeek = d.getDay();
            const monOff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const mon = new Date(d);
            mon.setDate(d.getDate() + monOff);
            mon.setHours(0, 0, 0, 0);
            weekKeys.add(mon.getTime());
          });

          // Walk backwards from current week
          // If current week has no workouts yet, start from last week
          // (don't break the streak just because the new week only just started)
          const sortedWeeks = [...weekKeys].sort((a, b) => b - a);
          let streakCount = 0;
          const currentMonday = new Date(now);
          const cmOff = now.getDay() === 0 ? -6 : 1 - now.getDay();
          currentMonday.setDate(now.getDate() + cmOff);
          currentMonday.setHours(0, 0, 0, 0);
          let checkMs = currentMonday.getTime();

          // If no workout this week, skip to last week without breaking streak
          if (!sortedWeeks.includes(checkMs)) {
            checkMs -= 7 * 24 * 60 * 60 * 1000;
          }

          for (let i = 0; i < 200; i++) {
            if (sortedWeeks.includes(checkMs)) {
              streakCount++;
              checkMs -= 7 * 24 * 60 * 60 * 1000;
            } else {
              break;
            }
          }
          setStreak(streakCount);
        }
      } catch (err) {
        console.error('Error loading workout stats:', err);
      } finally {
        setStatsLoaded(true);
      }
    };
    loadStats();
  }, [currentUser, clientData, view]);

  // Build storage paths from equipment + focus selection
  const getStoragePaths = () => {
    // New structure: exercises/{equipment}/{focus}/
    // fullbody = pull from both upper/ and lower/
    // mix = pull from all folders (core, upper, lower)
    // Legacy fallback: core/ (for existing bodyweight core videos)
    const paths = [];
    let focusKeys;
    if (focusArea === 'mix') {
      focusKeys = ['core', 'upper', 'lower'];
    } else if (focusArea === 'fullbody') {
      focusKeys = ['upper', 'lower'];
    } else {
      focusKeys = [focusArea];
    }
    for (const eq of selectedEquipment) {
      for (const fk of focusKeys) {
        paths.push(`exercises/${eq}/${fk}`);
      }
    }
    return paths;
  };

  // Load exercises from Firebase Storage
  const loadExercises = async () => {
    if (loadingRef.current) {
      while (loadingRef.current) {
        await new Promise(r => setTimeout(r, 200));
      }
      return exercisesRef.current;
    }
    loadingRef.current = true;
    setLoadingExercises(true);
    try {
      const paths = getStoragePaths();
      const allItems = [];

      for (const path of paths) {
        try {
          const folderRef = ref(storage, path);
          const result = await listAll(folderRef);
          allItems.push(...result.items);
        } catch (err) {
          // Folder might not exist yet - that's OK, skip it
          console.warn(`Folder ${path} not found, skipping.`);
        }
      }

      // Legacy fallback: if bodyweight + core selected and no new-structure files found,
      // try the old core/ folder
      if (allItems.length === 0 && selectedEquipment.includes('bodyweight') && focusArea === 'core') {
        try {
          const legacyRef = ref(storage, 'core');
          const legacyResult = await listAll(legacyRef);
          allItems.push(...legacyResult.items);
        } catch (err) {
          console.warn('Legacy core/ folder not found either.');
        }
      }

      if (allItems.length === 0) {
        const eqLabel = selectedEquipment.map(e => EQUIPMENT.find(eq => eq.key === e)?.label).join(' + ');
        const focusLabel = FOCUS_AREAS.find(f => f.key === focusArea)?.label;
        showToast(`No exercises found for ${eqLabel} / ${focusLabel}. Upload videos to Firebase Storage.`, 'error');
        loadingRef.current = false;
        setLoadingExercises(false);
        return [];
      }

      // Deduplicate by file name (same exercise in multiple equipment folders)
      const seen = new Set();
      const uniqueItems = allItems.filter(item => {
        const name = item.name.replace(/\.(mp4|gif)$/i, '');
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });

      const exercises = await Promise.all(
        uniqueItems.map(async (item) => {
          const url = await getDownloadURL(item);
          const name = toTitleCase(item.name.replace(/\.(mp4|gif)$/i, ''));
          const isGif = /\.gif$/i.test(item.name);
          return { name, videoUrl: url, isGif };
        })
      );
      exercisesRef.current = exercises;
      setAllExercises(exercises);
      loadingRef.current = false;
      setLoadingExercises(false);
      return exercises;
    } catch (err) {
      console.error('Error loading exercises:', err);
      const msg = err.code === 'storage/unauthorized'
        ? 'Storage access denied. Check Firebase Storage rules allow read access.'
        : `Failed to load exercises: ${err.message || err.code || 'Unknown error'}`;
      showToast(msg, 'error');
      loadingRef.current = false;
      setLoadingExercises(false);
      return [];
    }
  };

  // Generate random workout
  const generateWorkout = async () => {
    if (freeRandomiserLimitReached) return;
    setView('spinning');
    // Clear cache so new selections load fresh exercises
    exercisesRef.current = [];
    const exercises = await loadExercises();
    if (exercises.length === 0) {
      setView('setup');
      return;
    }

    const config = LEVELS.find(l => l.key === level);
    setLevelConfig(config);
    const intervalTime = config.work + config.rest;
    const totalSeconds = duration * 60;
    const totalIntervals = Math.floor(totalSeconds / intervalTime);

    // Determine exercises per round and number of rounds (min 2 rounds)
    let exPerRound, numRounds;
    if (totalIntervals <= 6) {
      exPerRound = Math.max(3, Math.floor(totalIntervals / 2));
      numRounds = Math.floor(totalIntervals / exPerRound);
    } else if (totalIntervals <= 12) {
      exPerRound = Math.min(6, Math.floor(totalIntervals / 2));
      numRounds = Math.floor(totalIntervals / exPerRound);
    } else {
      exPerRound = Math.min(10, Math.floor(totalIntervals / 2));
      numRounds = Math.floor(totalIntervals / exPerRound);
    }
    numRounds = Math.max(2, numRounds);

    const shuffled = shuffleArray(exercises);
    const selected = shuffled.slice(0, Math.min(exPerRound, shuffled.length));

    setWorkout(selected);
    setRounds(numRounds);

    // Spin animation for 2s then show preview
    setTimeout(() => setView('preview'), 2000);
  };

  // Start workout (3-2-1 countdown then go)
  const startWorkout = () => {
    setView('countdown');
    setStartCountdown(3);
  };

  // Countdown 3-2-1 effect
  useEffect(() => {
    if (view !== 'countdown') return;
    if (startCountdown <= 0) {
      setView('workout');
      setCurrentRound(1);
      setCurrentExIndex(0);
      setPhase('work');
      setTimeLeft(levelConfig.work);
      setIsPaused(false);
      playGo();
      return;
    }
    playBeep();
    const t = setTimeout(() => setStartCountdown(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [startCountdown, view]);

  // Main workout timer
  useEffect(() => {
    if (view !== 'workout' || isPaused) return;
    if (timeLeft <= 0) {
      advanceWorkout();
      return;
    }
    // Beep on last 3 seconds
    if (timeLeft <= 3) playBeep();

    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, view, isPaused]);

  const advanceWorkout = () => {
    if (phase === 'work') {
      // Go to rest
      setPhase('rest');
      setTimeLeft(levelConfig.rest);
    } else {
      // Advance to next exercise
      const nextIdx = currentExIndex + 1;
      if (nextIdx >= workout.length) {
        // End of round
        const nextRound = currentRound + 1;
        if (nextRound > rounds) {
          setShowFinish(true);
          saveWorkoutLog();
          return;
        }
        setCurrentRound(nextRound);
        setCurrentExIndex(0);
      } else {
        setCurrentExIndex(nextIdx);
      }
      setPhase('work');
      setTimeLeft(levelConfig.work);
      playGo();
    }
  };

  // Save completed workout to Firestore
  const saveWorkoutLog = async () => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'workoutLogs'), {
        clientId: clientData.id,
        level,
        duration,
        equipment: selectedEquipment,
        focus: focusArea,
        exerciseCount: workout.length,
        rounds,
        exercises: workout.map(e => e.name),
        completedAt: Timestamp.now(),
      });
      setWeeklyCount(c => c + 1);
      setTotalCount(c => c + 1);
      setTotalMinutes(m => m + duration);
      setLevelBreakdown(lb => ({ ...lb, [level]: (lb[level] || 0) + 1 }));
    } catch (err) {
      console.error('Error saving workout log:', err);
    }
  };

  // ==================== MUSCLE GROUP PB / VOLUME / BADGE FUNCTIONS ====================

  const mgCheckPB = async (exerciseName, weight, reps) => {
    if (!clientData || !weight) return;
    try {
      const docId = clientData.id;
      const pbDoc = await getDoc(doc(db, 'coreBuddyPBs', docId));
      const existing = pbDoc.exists() ? pbDoc.data() : null;
      const currentExercises = existing?.exercises || {};
      const currentPB = currentExercises[exerciseName];

      let isNewPB = false;
      if (!currentPB) {
        isNewPB = true;
      } else {
        if (weight > (currentPB.weight || 0)) {
          isNewPB = true;
        } else if (weight === (currentPB.weight || 0) && reps > (currentPB.reps || 0)) {
          isNewPB = true;
        }
      }

      if (isNewPB) {
        const updatedExercises = {
          ...currentExercises,
          [exerciseName]: { weight, reps, achievedAt: Timestamp.now() },
        };
        await setDoc(doc(db, 'coreBuddyPBs', docId), {
          clientId: clientData.id,
          exercises: updatedExercises,
          updatedAt: Timestamp.now(),
        });
        showToast(`New PB! ${weight}kg \u00D7 ${reps} reps`, 'success');
        playBeep();
        await mgCheckTargetBadge(exerciseName, weight);
      }
    } catch (err) {
      console.error('Error checking PB:', err);
    }
  };

  const mgCheckTargetBadge = async (exerciseName, newWeight) => {
    if (!clientData) return;
    try {
      const targetDoc = await getDoc(doc(db, 'coreBuddyTargets', clientData.id));
      if (!targetDoc.exists()) return;
      const targets = targetDoc.data().targets || {};
      const target = targets[exerciseName];
      if (!target || newWeight < target.targetWeight) return;

      const achDoc = await getDoc(doc(db, 'coreBuddyAchievements', clientData.id));
      const achData = achDoc.exists() ? achDoc.data() : { clientId: clientData.id, badges: [], totalVolume: 0 };
      const alreadyEarned = achData.badges.some(
        b => b.type === 'pb_target' && b.exercise === exerciseName && b.targetWeight === target.targetWeight
      );
      if (alreadyEarned) return;

      const newBadge = {
        type: 'pb_target',
        exercise: exerciseName,
        group: EXERCISE_GROUPS[exerciseName] || 'push',
        targetWeight: target.targetWeight,
        achievedAt: Timestamp.now(),
      };
      const updatedBadges = [...achData.badges, newBadge];
      await setDoc(doc(db, 'coreBuddyAchievements', clientData.id), {
        ...achData,
        badges: updatedBadges,
        updatedAt: Timestamp.now(),
      });
      setMgSessionBadges(prev => [...prev, newBadge]);
    } catch (err) {
      console.error('Error checking target badge:', err);
    }
  };

  const mgUpdateVolume = async (sessionVolume) => {
    if (!clientData || sessionVolume <= 0) return;
    try {
      const achDoc = await getDoc(doc(db, 'coreBuddyAchievements', clientData.id));
      const achData = achDoc.exists() ? achDoc.data() : { clientId: clientData.id, badges: [], totalVolume: 0 };
      const oldVolume = achData.totalVolume || 0;
      const newVolume = oldVolume + sessionVolume;

      const newMilestoneBadges = [];
      VOLUME_MILESTONES.forEach(milestone => {
        if (newVolume >= milestone.threshold && oldVolume < milestone.threshold) {
          const alreadyEarned = achData.badges.some(
            b => b.type === 'volume_milestone' && b.milestone === milestone.threshold
          );
          if (!alreadyEarned) {
            newMilestoneBadges.push({
              type: 'volume_milestone',
              milestone: milestone.threshold,
              label: milestone.label,
              achievedAt: Timestamp.now(),
            });
          }
        }
      });

      const allBadges = [...achData.badges, ...newMilestoneBadges];
      await setDoc(doc(db, 'coreBuddyAchievements', clientData.id), {
        clientId: clientData.id,
        badges: allBadges,
        totalVolume: Math.round(newVolume),
        updatedAt: Timestamp.now(),
      });

      if (newMilestoneBadges.length > 0) {
        setMgSessionBadges(prev => [...prev, ...newMilestoneBadges]);
      }
    } catch (err) {
      console.error('Error updating volume:', err);
    }
  };

  // ==================== MUSCLE GROUP WORKOUT FUNCTIONS ====================

  // Start a muscle group strength session
  const startMuscleSession = async (session) => {
    setSelectedMuscleSession(session);

    if (session.interval) {
      // Core interval session — load videos then use the randomiser flow
      const exercises = [];
      for (const ex of session.exercises) {
        let videoUrl = null;
        let isGif = false;
        if (ex.storagePath) {
          try {
            const storageRef = ref(storage, ex.storagePath);
            videoUrl = await getDownloadURL(storageRef);
            isGif = /\.gif$/i.test(ex.storagePath);
          } catch (e) { /* video not uploaded yet */ }
        }
        exercises.push({ name: ex.name, videoUrl, isGif });
      }
      setWorkout(exercises);
      setRounds(session.rounds);
      setLevelConfig({ work: session.work, rest: session.rest });
      setView('preview');
      return;
    }

    // Strength session — load videos and init logs
    const urls = {};
    for (const ex of session.exercises) {
      if (ex.storagePath) {
        try {
          const storageRef = ref(storage, ex.storagePath);
          urls[ex.name] = { url: await getDownloadURL(storageRef), isGif: /\.gif$/i.test(ex.storagePath) };
        } catch (e) { /* placeholder — no video yet */ }
      }
    }
    setMgVideoUrls(urls);

    const logs = session.exercises.map(ex => ({
      name: ex.name,
      type: ex.type,
      targetSets: ex.sets,
      targetReps: ex.reps || 0,
      targetTime: ex.time || 0,
      sets: [],
    }));
    setMgLogs(logs);
    setMgExIdx(0);
    setMgSetIdx(0);
    setMgWeightInput('');
    setMgRepsInput('');
    setMgVideoPlaying(false);
    setMgTimerActive(false);
    setMgTimerValue(0);
    setMgSessionBadges([]);
    setMgBadgeCelebration(null);
    setView('muscle_workout');
  };

  // Toggle muscle group video playback
  const toggleMgVideo = () => {
    const vid = mgVideoRef.current;
    if (!vid) return;
    if (vid.paused) { vid.play(); setMgVideoPlaying(true); }
    else { vid.pause(); setMgVideoPlaying(false); }
  };

  // Muscle group timer countdown
  useEffect(() => {
    if (view !== 'muscle_workout' || !mgTimerActive || mgTimerValue <= 0) {
      if (view === 'muscle_workout' && mgTimerActive && mgTimerValue <= 0) {
        setMgTimerActive(false);
        playBeep();
      }
      return;
    }
    mgTimerRef.current = setTimeout(() => setMgTimerValue(v => v - 1), 1000);
    return () => clearTimeout(mgTimerRef.current);
  }, [view, mgTimerActive, mgTimerValue]);

  // Log a set in muscle group workout
  const mgLogSet = async () => {
    const exLog = mgLogs[mgExIdx];
    let setData = {};

    if (exLog.type === 'weighted') {
      const w = parseFloat(mgWeightInput) || 0;
      const r = parseInt(mgRepsInput) || 0;
      if (r === 0) { showToast('Enter your reps', 'error'); return; }
      setData = { weight: w, reps: r };
    } else if (exLog.type === 'reps') {
      const r = parseInt(mgRepsInput) || 0;
      if (r === 0) { showToast('Enter your reps', 'error'); return; }
      setData = { reps: r };
    } else if (exLog.type === 'timed') {
      const elapsed = exLog.targetTime - mgTimerValue;
      setData = { time: Math.max(elapsed, 1) };
    }

    const updated = [...mgLogs];
    updated[mgExIdx] = { ...exLog, sets: [...exLog.sets, setData] };
    setMgLogs(updated);

    // Check for new PB on weighted exercises
    if (exLog.type === 'weighted' && setData.weight > 0) {
      await mgCheckPB(exLog.name, setData.weight, setData.reps);
    }

    const nextSet = exLog.sets.length + 1;
    if (nextSet < exLog.targetSets) {
      setMgSetIdx(nextSet);
      setMgRepsInput('');
      setMgTimerActive(false);
      setMgTimerValue(0);
    } else {
      // Move to next exercise
      if (mgExIdx + 1 < mgLogs.length) {
        const nextIdx = mgExIdx + 1;
        setMgExIdx(nextIdx);
        setMgSetIdx(0);
        setMgWeightInput('');
        setMgRepsInput('');
        setMgVideoPlaying(false);
        setMgTimerActive(false);
        setMgTimerValue(0);
      } else {
        // All exercises done
        await saveMgWorkoutLog(updated);
        setShowMgFinish(true);
      }
    }
  };

  // Save muscle group workout log
  const saveMgWorkoutLog = async (logs) => {
    if (!currentUser || !clientData) return;
    try {
      const volume = logs.reduce((sum, l) =>
        sum + l.sets.reduce((s, set) => s + ((set.weight || 0) * (set.reps || 0)), 0), 0);
      const totalSets = logs.reduce((sum, l) => sum + l.sets.length, 0);
      await addDoc(collection(db, 'workoutLogs'), {
        clientId: clientData.id,
        type: 'muscle_group',
        muscleGroup: selectedMuscleGroup,
        sessionId: selectedMuscleSession?.id,
        sessionName: selectedMuscleSession?.name,
        exerciseCount: logs.length,
        totalSets,
        duration: Math.round(totalSets * 1.5),
        volume: Math.round(volume),
        exercises: logs.map(l => ({ name: l.name, type: l.type, sets: l.sets })),
        completedAt: Timestamp.now(),
      });

      // Update cumulative volume and check milestones
      if (volume > 0) {
        await mgUpdateVolume(volume);
      }

      // Trigger badge celebration if any badges earned during session
      if (mgSessionBadges.length > 0) {
        setMgBadgeCelebration({ badges: [...mgSessionBadges] });
      }
    } catch (err) {
      console.error('Error saving muscle group workout log:', err);
    }
  };

  // Audio helpers (Web Audio API for beeps)
  const audioCtxRef = useRef(null);
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const playBeep = () => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  };

  const playGo = () => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1200;
      gain.gain.value = 0.4;
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  };

  // Restart GIF loop (in case the GIF file doesn't loop infinitely)
  useEffect(() => {
    if (view !== 'workout' || phase !== 'work') return;
    const ex = workout[currentExIndex];
    if (!ex?.isGif) return;

    const interval = setInterval(() => {
      const img = gifRef.current;
      if (!img) return;
      const src = img.getAttribute('src');
      img.removeAttribute('src');
      setTimeout(() => {
        if (gifRef.current) gifRef.current.setAttribute('src', src);
      }, 0);
    }, 4000);

    return () => clearInterval(interval);
  }, [view, phase, currentExIndex, currentRound, workout]);

  // Render countdown ring
  const renderCountdownRing = (current, total, colorClass) => {
    const filled = Math.round((current / total) * TICK_COUNT);
    return (
      <svg className="wk-ring-svg" viewBox="0 0 200 200">
        {TICKS_82_94.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            className={i < filled ? `wk-tick-filled ${colorClass}` : 'wk-tick-empty'}
            strokeWidth={t.thick ? '3' : '2'} />
        ))}
      </svg>
    );
  };

  // Total workout progress
  const getTotalProgress = () => {
    const totalExercises = workout.length * rounds;
    const completed = (currentRound - 1) * workout.length + currentExIndex + (phase === 'rest' ? 0.5 : 0);
    return completed / totalExercises;
  };

  // Toast element - rendered at the end of every view
  const toastEl = toast && (
    <div className={`toast-notification ${toast.type}`}>
      {toast.message}
    </div>
  );

  if (authLoading) {
    return (
      <div className="wk-page" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          </div>
        </header>
        <div className="wk-loading-inline"><div className="wk-loading-spinner" /></div>
      </div>
    );
  }

  // ==================== MENU VIEW ====================
  if (view === 'menu') {
    return (
      <PullToRefresh>
      <div className="wk-page" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
            <div className="header-actions">
              <button onClick={toggleTheme} aria-label="Toggle theme">
                {isDark ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )}
              </button>
            </div>
          </div>
        </header>
        <main className="wk-main">

          {/* Heading */}
          <div className="wk-menu-heading">
            <h2>Choose Your Workout</h2>
            <p>No excuses. Just results.</p>
          </div>

          {/* Hero Card: Randomise Workout */}
          <button className="wk-hero-card" onClick={() => setView('setup')}>
            <img src={randomiserCardImg} alt="Randomise Workout" className="wk-hero-bg" />
          </button>

          {/* Premium bait card (free users only) */}
          {!isPremium && (
            <button className="wk-hero-card wk-free-card-premium" onClick={() => navigate('/upgrade')}>
              <img src={programmeCardImg} alt="Programmes" className="wk-hero-bg" />
              <div className="wk-free-card-overlay" />
              <div className="wk-free-card-content">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span className="wk-free-card-label">Unlock Full Access</span>
              </div>
            </button>
          )}

          {/* Programmes Section (premium only) */}
          {isPremium && (
          <>
          <div className="wk-section-header">
            <h2>Programmes</h2>
            <span className="wk-section-count">{PROGRAMME_CARDS.length} available</span>
          </div>

          <div className="wk-prog-scroll-wrap">
            <div className="wk-prog-scroll">
              {PROGRAMME_CARDS.map((prog, i) => prog.image ? (
                <button key={prog.id} className="wk-prog-img-card"
                  onClick={() => navigate('/client/core-buddy/programmes', { state: { templateId: prog.id } })}
                  style={{ animationDelay: `${i * 0.06}s` }}>
                  <img src={prog.image} alt={prog.name} className="wk-prog-img" />
                  {i === 0 && (
                    <div className="wk-swipe-arrow">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                    </div>
                  )}
                </button>
              ) : (
                <button key={prog.id} className="wk-prog-hero-card"
                  onClick={() => navigate('/client/core-buddy/programmes', { state: { templateId: prog.id } })}
                  style={{ animationDelay: `${i * 0.06}s` }}>
                  <img src={programmeCardImg} alt="Programme" className="wk-prog-hero-bg" loading="lazy" />
                  <div className="wk-prog-hero-overlay" style={{ background: FOCUS_GRADIENTS[prog.focus] }} />
                  <div className="wk-prog-hero-content">
                    <div className="wk-prog-hero-top">
                      <span className="wk-prog-hero-badge">{prog.duration} WEEKS</span>
                      <span className="wk-prog-hero-level">{prog.level}</span>
                    </div>
                    <div className="wk-prog-hero-bottom">
                      <h3>{prog.name.toUpperCase()}</h3>
                      <p>{prog.daysPerWeek}x per week &bull; {prog.focus === 'fullbody' ? 'Full Body' : prog.focus.charAt(0).toUpperCase() + prog.focus.slice(1)} Focus</p>
                      <span className="wk-prog-hero-go">VIEW PROGRAMME &rarr;</span>
                    </div>
                  </div>
                  {i === 0 && (
                    <div className="wk-swipe-arrow">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
          </>
          )}

          {/* Muscle Groups Section (premium only) */}
          {isPremium && (
          <>
          <div className="wk-section-header">
            <h2>Muscle Groups</h2>
            <span className="wk-section-count">{MUSCLE_GROUPS.length} groups</span>
          </div>

          <div className="wk-muscle-grid">
            {MUSCLE_GROUPS.map((mg, i) => (
              <button key={mg.key} className={`wk-muscle-hero-card${mg.image ? ' wk-muscle-thumb' : ''}`}
                onClick={() => { setSelectedMuscleGroup(mg.key); setView('muscle_sessions'); }}
                style={{ animationDelay: `${i * 0.05}s` }}>
                {mg.image ? (
                  <img src={mg.image} alt={mg.label} className="wk-muscle-thumb-img" />
                ) : (
                  <>
                    <img src={randomiserCardImg} alt="Muscle group" className="wk-muscle-hero-bg" loading="lazy" />
                    <div className="wk-muscle-hero-overlay" style={{ background: MUSCLE_GRADIENTS[mg.key] }} />
                    <div className="wk-muscle-hero-content">
                      <div className="wk-muscle-hero-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d={mg.icon} /></svg>
                      </div>
                      <div className="wk-muscle-hero-text">
                        <span className="wk-muscle-hero-name">{mg.label}</span>
                        <span className="wk-muscle-hero-count">{MUSCLE_GROUP_SESSIONS[mg.key]?.length || 0} sessions</span>
                      </div>
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>
          </>
          )}
        </main>
        <CoreBuddyNav active="workouts" />
        {toastEl}
      </div>
      </PullToRefresh>
    );
  }

  // ==================== SETUP VIEW ====================
  if (view === 'setup') {
    const focusLabel = FOCUS_AREAS.find(f => f.key === focusArea)?.label || focusArea;
    const levelLabel = LEVELS.find(l => l.key === level)?.label || level;
    return (
      <div className="wk-page" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView('menu')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
            <div className="header-actions">
              <button onClick={toggleTheme} aria-label="Toggle theme">
                {isDark ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )}
              </button>
            </div>
          </div>
        </header>
        <main className="wk-main wk-setup-main">

          {/* Stats Rings */}
          <div className="wk-stats-row">
            {[
              { label: 'Total', value: `${totalCount}`, pct: totalCount > 0 ? Math.min(Math.round((totalCount / 100) * 100), 100) : 0, color: '#14b8a6', size: 'normal' },
              { label: 'This Week', value: `${weeklyCount}/${WEEKLY_TARGET}`, pct: Math.round((Math.min(weeklyCount, WEEKLY_TARGET) / WEEKLY_TARGET) * 100), color: 'var(--color-primary)', size: 'large' },
              { label: 'Wk Streak', value: `${streak}`, pct: streak > 0 ? Math.min(Math.round((streak / 12) * 100), 100) : 0, color: '#38B6FF', size: 'normal' },
            ].map((ring) => {
              const r = 38;
              const circ = 2 * Math.PI * r;
              const offset = circ - (ring.pct / 100) * circ;
              return (
                <div key={ring.label} className={`wk-stat-item${ring.size === 'large' ? ' wk-stat-large' : ''}`}>
                  <div className="wk-stat-ring">
                    <svg viewBox="0 0 100 100">
                      <circle className="wk-stat-track" cx="50" cy="50" r={r} />
                      <circle className="wk-stat-fill" cx="50" cy="50" r={r}
                        style={{ stroke: ring.color }}
                        strokeDasharray={circ}
                        strokeDashoffset={offset} />
                    </svg>
                    <span className="wk-stat-value" style={{ color: ring.color }}>{ring.value}</span>
                  </div>
                  <span className="wk-stat-label">{ring.label}</span>
                </div>
              );
            })}
          </div>

          <div className="wk-setup-flow">
            {/* Focus Area */}
            <div className="wk-setup-section">
              <h2>Focus Area</h2>
              <div className="wk-focus-grid">
                {FOCUS_AREAS.map(f => (
                  <button key={f.key}
                    className={`wk-equip-btn${focusArea === f.key ? ' active' : ''}${f.key === 'mix' ? ' wk-mix-btn' : ''}`}
                    onClick={() => setFocusArea(f.key)}>
                    <svg className="wk-equip-icon" viewBox="0 0 24 24" fill="currentColor"><path d={f.icon} /></svg>
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Level */}
            <div className="wk-setup-section">
              <h2>Level</h2>
              <div className="wk-level-cards">
                {LEVELS.map(l => (
                  <button key={l.key} className={`wk-level-card wk-level-${l.key}${level === l.key ? ' active' : ''}`} onClick={() => setLevel(l.key)}>
                    <span className="wk-level-name">{l.label}</span>
                    <span className="wk-level-desc">{l.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Time */}
            <div className="wk-setup-section">
              <h2>Time</h2>
              <div className="wk-time-options">
                {TIME_OPTIONS.map(t => {
                  const locked = !availableTimeOptions.includes(t);
                  return (
                    <button key={t} className={`wk-time-btn${duration === t ? ' active' : ''}${locked ? ' locked' : ''}`} onClick={() => !locked && setDuration(t)} disabled={locked}>
                      <span className="wk-time-num">{t}</span>
                      <span className="wk-time-unit">{locked ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> : 'min'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Equipment */}
            <div className="wk-setup-section">
              <h2>Equipment</h2>
              <div className="wk-equip-options">
                {EQUIPMENT.map(eq => {
                  const isSelected = selectedEquipment.includes(eq.key);
                  return (
                    <button key={eq.key}
                      className={`wk-equip-btn${isSelected ? ' active' : ''}`}
                      onClick={() => {
                        setSelectedEquipment(prev => {
                          if (isSelected && prev.length === 1) return prev;
                          return isSelected ? prev.filter(k => k !== eq.key) : [...prev, eq.key];
                        });
                      }}>
                      <svg className="wk-equip-icon" viewBox="0 0 24 24" fill="currentColor"><path d={eq.icon} /></svg>
                      <span>{eq.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Summary */}
            <div className="wk-setup-summary">
              <span>{focusLabel} &middot; {levelLabel} &middot; {duration} min</span>
            </div>
          </div>
        </main>

        {/* Sticky GO button */}
        <div className="wk-go-sticky">
          {freeRandomiserLimitReached && (
            <p className="wk-free-limit-msg">You've used your free workout this week. Upgrade for unlimited access.</p>
          )}
          <button className="wk-randomise-btn" onClick={generateWorkout} disabled={loadingExercises || freeRandomiserLimitReached}>
            {loadingExercises ? 'Loading exercises...' : freeRandomiserLimitReached ? 'Limit Reached' : 'Randomise Workout'}
          </button>
        </div>
        {toastEl}
      </div>
    );
  }

  // ==================== SPINNING VIEW ====================
  if (view === 'spinning') {
    return (
      <div className="wk-page wk-page-center" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        <div className="wk-spin-container">
          <div className="wk-spin-ring">
            <svg className="wk-spin-svg" viewBox="0 0 200 200">
              {TICKS_78_94.map((t, i) => (
                <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                  className="wk-spin-tick"
                  strokeWidth={t.thick ? '3.5' : '2'}
                  style={{ animationDelay: `${i * 0.03}s` }} />
              ))}
            </svg>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="wk-spin-logo" width="50" height="50" />
          </div>
          <p className="wk-spin-text">Generating workout...</p>
        </div>
        {toastEl}
      </div>
    );
  }

  // ==================== PREVIEW VIEW ====================
  if (view === 'preview') {
    const previewConfig = selectedMuscleSession?.interval ? { work: selectedMuscleSession.work, rest: selectedMuscleSession.rest } : LEVELS.find(l => l.key === level);
    const totalTime = workout.length * rounds * (previewConfig.work + previewConfig.rest);
    return (
      <div className="wk-page" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView(selectedMuscleSession?.interval ? 'muscle_sessions' : 'setup')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
            <div className="header-actions">
              <button onClick={toggleTheme} aria-label="Toggle theme">
                {isDark ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )}
              </button>
            </div>
          </div>
        </header>
        <main className="wk-main">
          {selectedMuscleSession?.interval && (
            <h2 className="mg-preview-title">{selectedMuscleSession.name}</h2>
          )}
          <div className="wk-preview-stats">
            <div className="wk-stat">
              <span className="wk-stat-val">{workout.length}</span>
              <span className="wk-stat-label">Exercises</span>
            </div>
            <div className="wk-stat">
              <span className="wk-stat-val">{rounds}</span>
              <span className="wk-stat-label">Rounds</span>
            </div>
            <div className="wk-stat">
              <span className="wk-stat-val">{Math.ceil(totalTime / 60)}</span>
              <span className="wk-stat-label">Minutes</span>
            </div>
            <div className="wk-stat">
              <span className="wk-stat-val">{previewConfig.work}/{previewConfig.rest}</span>
              <span className="wk-stat-label">Work/Rest</span>
            </div>
          </div>

          <div className="wk-preview-list">
            {workout.map((ex, i) => (
              <div key={i} className="wk-preview-item" style={{ animationDelay: `${i * 0.06}s` }} onClick={() => setPreviewEx(ex)}>
                <span className="wk-preview-num">{i + 1}</span>
                <div className="wk-preview-thumb">
                  {ex.isGif ? (
                    <img src={ex.videoUrl} alt={ex.name} loading="lazy" />
                  ) : (
                    <video src={`${ex.videoUrl}#t=0.1`} muted playsInline preload="auto" />
                  )}
                </div>
                <span className="wk-preview-name">{ex.name}</span>
                <svg className="wk-preview-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            ))}
          </div>

          {/* Quick-preview modal */}
          {previewEx && (
            <div className="wk-preview-modal-backdrop" onClick={() => setPreviewEx(null)}>
              <div className="wk-preview-modal" onClick={e => e.stopPropagation()}>
                <button className="wk-preview-modal-close" onClick={() => setPreviewEx(null)} aria-label="Close preview">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div className="wk-preview-modal-video">
                  {previewEx.isGif ? (
                    <img src={previewEx.videoUrl} alt={previewEx.name} />
                  ) : (
                    <video src={previewEx.videoUrl} autoPlay loop muted playsInline />
                  )}
                </div>
                <h3 className="wk-preview-modal-title">{previewEx.name}</h3>
              </div>
            </div>
          )}

          <div className="wk-preview-actions">
            {!selectedMuscleSession?.interval && (
              <button className="wk-btn-secondary" onClick={() => generateWorkout()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Reshuffle
              </button>
            )}
            <button className="wk-btn-primary" onClick={startWorkout}>
              Start Workout
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ==================== COUNTDOWN VIEW (3-2-1) ====================
  if (view === 'countdown') {
    return (
      <div className="wk-page wk-page-center wk-page-dark" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        <div className="wk-countdown-big">
          <span className="wk-countdown-num">{startCountdown}</span>
          <span className="wk-countdown-label">GET READY</span>
        </div>
      </div>
    );
  }

  // ==================== ACTIVE WORKOUT VIEW ====================
  if (view === 'workout') {
    const currentEx = workout[currentExIndex];
    const phaseDuration = phase === 'work' ? levelConfig.work : levelConfig.rest;
    const nextEx = phase === 'rest'
      ? (currentExIndex + 1 < workout.length ? workout[currentExIndex + 1] : (currentRound < rounds ? workout[0] : null))
      : null;

    return (
      <div className="wk-page wk-page-workout" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        {/* Video */}
        <div className="wk-video-container">
          {phase === 'work' ? (
            currentEx.isGif ? (
              <img ref={gifRef} key={currentEx.videoUrl} className="wk-video" src={currentEx.videoUrl} alt={currentEx.name} />
            ) : (
              <video key={currentEx.videoUrl} className="wk-video" src={currentEx.videoUrl} autoPlay loop muted playsInline />
            )
          ) : (
            <div className="wk-rest-screen">
              <span className="wk-rest-label">REST</span>
              {nextEx && <span className="wk-next-label">Next: {nextEx.name}</span>}
            </div>
          )}
        </div>

        {/* Back button */}
        <div className="wk-back-row">
          <button className="wk-back-btn" onClick={() => { if (confirm('Leave workout?')) setView('menu'); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Back
          </button>
        </div>

        {/* Spotify Player */}
        <div className="wk-spotify">
          <iframe
            src="https://open.spotify.com/embed/playlist/37i9dQZF1DZ06evO3FJyYF?utm_source=generator&theme=0"
            width="100%"
            height="80"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title="Spotify Playlist"
          />
        </div>

        {/* Exercise info */}
        <div className="wk-exercise-info">
          <span className="wk-exercise-counter">{currentExIndex + 1} / {workout.length}</span>
          <h2 className="wk-exercise-name">{currentEx.name}</h2>
          <span className="wk-round-label">Round {currentRound} of {rounds}</span>
        </div>

        {/* Countdown Ring */}
        <div className="wk-timer-section">
          <div className="wk-timer-ring-wrap">
            {renderCountdownRing(timeLeft, phaseDuration, phase === 'work' ? 'wk-tick-work' : 'wk-tick-rest')}
            <div className="wk-timer-center">
              <span className="wk-timer-time">{timeLeft}</span>
              <span className={`wk-timer-phase ${phase}`}>{phase === 'work' ? 'WORK' : 'REST'}</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="wk-controls">
          <button className="wk-ctrl-btn wk-ctrl-stop" onClick={() => { if (confirm('End workout early?')) setView('menu'); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
          <button className="wk-ctrl-btn wk-ctrl-pause" onClick={() => setIsPaused(!isPaused)}>
            {isPaused ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            )}
          </button>
          <button className="wk-ctrl-btn wk-ctrl-skip" onClick={() => { setTimeLeft(0); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><rect x="15" y="4" width="4" height="16"/></svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="wk-progress-bar">
          <div className="wk-progress-fill" style={{ width: `${getTotalProgress() * 100}%` }} />
        </div>

        {/* Hold-to-finish overlay */}
        {showFinish && (() => {
          const config = LEVELS.find(l => l.key === level);
          const totalTime = workout.length * rounds * (config.work + config.rest);
          return (
            <WorkoutCelebration
              title="Workout Complete!"
              stats={[
                { value: Math.ceil(totalTime / 60), label: 'Minutes' },
                { value: workout.length * rounds, label: 'Intervals' },
                { value: rounds, label: 'Rounds' },
              ]}
              hideShare={!isPremium}
              onShareJourney={clientData ? shareToJourney : null}
              userName={clientData?.name}
              onDismissStart={() => setView('menu')}
              onDone={() => { setShowFinish(false); setSelectedMuscleSession(null); setSelectedMuscleGroup(null); }}
            />
          );
        })()}
      </div>
    );
  }

  // ==================== MUSCLE GROUP SESSION SELECTION VIEW ====================
  if (view === 'muscle_sessions') {
    const groupData = MUSCLE_GROUPS.find(g => g.key === selectedMuscleGroup);
    const sessions = MUSCLE_GROUP_SESSIONS[selectedMuscleGroup] || [];
    return (
      <div className="wk-page" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView('menu')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
            <div className="header-actions">
              <button onClick={toggleTheme} aria-label="Toggle theme">
                {isDark ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )}
              </button>
            </div>
          </div>
        </header>
        <main className="wk-main">
          <div className="mg-sessions-header">
            <div className="mg-sessions-icon" style={{ background: MUSCLE_GRADIENTS[selectedMuscleGroup] }}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d={groupData?.icon} /></svg>
            </div>
            <h2>{groupData?.label} Workouts</h2>
            <p>{sessions.length} sessions available</p>
          </div>

          <div className="mg-sessions-list">
            {sessions.map((session, i) => (
              <button key={session.id} className="mg-session-card"
                onClick={() => { setSelectedMuscleSession(session); setView('muscle_overview'); }}
                style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="mg-session-info">
                  <h3>{session.name}</h3>
                  <p>{session.desc}</p>
                  <div className="mg-session-meta">
                    {session.interval ? (
                      <>
                        <span className="mg-session-tag mg-tag-interval">Interval</span>
                        <span className="mg-session-tag">{session.exercises.length} exercises</span>
                        <span className="mg-session-tag">{session.rounds} rounds</span>
                      </>
                    ) : (
                      <>
                        <span className="mg-session-tag mg-tag-strength">Strength</span>
                        <span className="mg-session-tag">{session.exercises.length} exercises</span>
                        <span className="mg-session-tag">{(() => { const s = session.exercises.map(e => e.sets || 0); const min = Math.min(...s); const max = Math.max(...s); return min === max ? `${min} sets each` : `${min}-${max} sets each`; })()}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="mg-session-arrow">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              </button>
            ))}
          </div>
        </main>
        {toastEl}
      </div>
    );
  }

  // ==================== MUSCLE GROUP SESSION OVERVIEW VIEW ====================
  if (view === 'muscle_overview') {
    const session = selectedMuscleSession;
    if (!session) return null;
    const groupData = MUSCLE_GROUPS.find(g => g.key === selectedMuscleGroup);
    return (
      <div className="wk-page" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView('muscle_sessions')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
            <div className="header-actions">
              <button onClick={toggleTheme} aria-label="Toggle theme">
                {isDark ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )}
              </button>
            </div>
          </div>
        </header>
        <main className="wk-main mg-overview-main">
          {/* 16:9 Hero Image */}
          <div className="mg-overview-hero" style={!session.image ? { background: MUSCLE_GRADIENTS[selectedMuscleGroup] } : undefined}>
            {session.image ? (
              <img src={session.image} alt={session.name} className="mg-overview-hero-img" />
            ) : (
              <div className="mg-overview-hero-content">
                <svg viewBox="0 0 24 24" fill="currentColor" className="mg-overview-hero-icon"><path d={groupData?.icon} /></svg>
              </div>
            )}
          </div>

          {/* Session Header */}
          <div className="mg-overview-header">
            <div className="mg-overview-title-row">
              <h2>{session.name}</h2>
              {session.level && <span className="mg-overview-level">{session.level}</span>}
            </div>
            <p className="mg-overview-desc">{session.desc}</p>
          </div>

          {/* Overview Description */}
          {session.overview && (
            <div className="mg-overview-section">
              <h3>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                About This Workout
              </h3>
              <p>{session.overview}</p>
            </div>
          )}

          {/* Tips */}
          {session.tips && session.tips.length > 0 && (
            <div className="mg-overview-section">
              <h3>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                Tips &amp; Form
              </h3>
              <ul className="mg-overview-tips">
                {session.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Exercise List */}
          <div className="mg-overview-section">
            <h3>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>
              Exercises ({session.exercises.length})
            </h3>
            <div className="mg-overview-exercises">
              {session.exercises.map((ex, i) => (
                <div key={i} className="mg-overview-exercise">
                  <span className="mg-overview-ex-num">{i + 1}</span>
                  <div className="mg-overview-ex-info">
                    <span className="mg-overview-ex-name">{ex.name}</span>
                    {session.interval ? (
                      <span className="mg-overview-ex-detail">{session.work}s work / {session.rest}s rest</span>
                    ) : (
                      <span className="mg-overview-ex-detail">
                        {ex.sets} sets × {ex.reps ? `${ex.reps} reps` : `${ex.time}s`}
                        {ex.type === 'weighted' && ' — weighted'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Start Button */}
          <button className="mg-overview-start-btn" onClick={() => startMuscleSession(session)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Start Workout
          </button>
        </main>
        {toastEl}
      </div>
    );
  }

  // ==================== MUSCLE GROUP STRENGTH WORKOUT VIEW ====================
  if (view === 'muscle_workout') {
    const session = selectedMuscleSession;
    if (!session) return null;
    const exercise = session.exercises[mgExIdx];
    const exLog = mgLogs[mgExIdx];
    if (!exercise || !exLog) return null;
    const completedSets = exLog.sets.length;
    const totalExercises = session.exercises.length;
    const totalSetsAll = session.exercises.reduce((sum, e) => sum + (e.sets || 0), 0);
    const completedSetsAll = mgLogs.reduce((sum, l) => sum + l.sets.length, 0);
    const progressPct = (completedSetsAll / totalSetsAll) * 100;
    const videoData = mgVideoUrls[exercise.name];

    // Auto-init timer for timed exercises
    if (exercise.type === 'timed' && mgTimerValue === 0 && !mgTimerActive && completedSets === mgSetIdx) {
      setTimeout(() => setMgTimerValue(exercise.time), 0);
    }

    const logBtnText = completedSets + 1 < exercise.sets
      ? 'Log Set'
      : mgExIdx + 1 < totalExercises
        ? 'Log Set \u2192 Next Exercise'
        : 'Log Set \u2192 Complete';

    return (
      <div className="wk-page" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        {/* Progress bar */}
        <div className="mg-session-progress">
          <div className="mg-session-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => { if (confirm('End workout early?')) setView('muscle_overview'); }} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span className="mg-header-info">Exercise {mgExIdx + 1}/{totalExercises}</span>
            <div style={{ width: 22 }} />
          </div>
        </header>

        <main className="wk-main">
          {/* Video */}
          {videoData ? (
            <div className="mg-video-container" onClick={toggleMgVideo}>
              {videoData.isGif ? (
                <img className="mg-video" src={videoData.url} alt={exercise.name} />
              ) : (
                <video ref={mgVideoRef} key={exercise.name} className="mg-video" src={videoData.url} loop muted playsInline />
              )}
              {!mgVideoPlaying && !videoData.isGif && (
                <div className="mg-video-overlay">
                  <svg className="mg-play-icon" width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span className="mg-video-hint">Tap for demo</span>
                </div>
              )}
            </div>
          ) : (
            <div className="mg-video-placeholder">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/>
              </svg>
              <span>Video coming soon</span>
            </div>
          )}

          {/* Spotify Player */}
          <div className="wk-spotify">
            <iframe
              src="https://open.spotify.com/embed/playlist/37i9dQZF1DZ06evO3FJyYF?utm_source=generator&theme=0"
              width="100%"
              height="80"
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              title="Spotify Playlist"
            />
          </div>

          {/* Exercise card */}
          <div className="mg-exercise-card">
            <h2 className="mg-ex-name">{exercise.name}</h2>
            <span className={`mg-ex-type-badge ${exercise.type}`}>
              {exercise.type === 'weighted' ? 'Weight + Reps' : exercise.type === 'reps' ? 'Reps Only' : 'Timed'}
            </span>

            <div className="mg-ex-set-info">
              <span className="mg-ex-set-num">Set {completedSets + 1} of {exercise.sets}</span>
              {exercise.type !== 'timed' && (
                <span className="mg-ex-target">Target: {exercise.reps} reps</span>
              )}
              {exercise.type === 'timed' && (
                <span className="mg-ex-target">Target: {exercise.time}s</span>
              )}
            </div>

            {/* Input fields by type */}
            {exercise.type === 'weighted' && (
              <div className="mg-input-area">
                <div className="mg-input-group">
                  <label>Weight (kg)</label>
                  <input type="number" inputMode="decimal" className="mg-input" value={mgWeightInput}
                    onChange={e => setMgWeightInput(e.target.value)} placeholder="0" />
                </div>
                <div className="mg-input-group">
                  <label>Reps</label>
                  <input type="number" inputMode="numeric" className="mg-input" value={mgRepsInput}
                    onChange={e => setMgRepsInput(e.target.value)} placeholder="0" />
                </div>
              </div>
            )}

            {exercise.type === 'reps' && (
              <div className="mg-input-area">
                <div className="mg-input-group mg-input-single">
                  <label>Reps</label>
                  <input type="number" inputMode="numeric" className="mg-input" value={mgRepsInput}
                    onChange={e => setMgRepsInput(e.target.value)} placeholder="0" />
                </div>
              </div>
            )}

            {exercise.type === 'timed' && (
              <div className="mg-timer-area">
                <div className="mg-timer-display">
                  <span className="mg-timer-value">{mgTimerValue}s</span>
                </div>
                {!mgTimerActive ? (
                  <button className="mg-timer-btn" onClick={() => {
                    if (mgTimerValue === 0) setMgTimerValue(exercise.time);
                    setMgTimerActive(true);
                  }}>
                    {mgTimerValue < exercise.time && mgTimerValue > 0 ? 'Resume' : 'Start Timer'}
                  </button>
                ) : (
                  <button className="mg-timer-btn mg-timer-stop" onClick={() => setMgTimerActive(false)}>
                    Stop
                  </button>
                )}
              </div>
            )}

            {/* Log Set button */}
            <button className="mg-log-set-btn" onClick={mgLogSet}>{logBtnText}</button>

            {/* Completed sets */}
            {exLog.sets.length > 0 && (
              <div className="mg-completed-sets">
                {exLog.sets.map((s, i) => (
                  <div key={i} className="mg-completed-set">
                    <span className="mg-completed-set-check">&#10003;</span>
                    <span>Set {i + 1}: {s.weight != null ? `${s.weight}kg \u00D7 ${s.reps}` : s.reps != null ? `${s.reps} reps` : `${s.time}s`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
        {toastEl}

        {/* Hold-to-finish overlay */}
        {showMgFinish && (() => {
          const totalSets = mgLogs.reduce((sum, l) => sum + l.sets.length, 0);
          const totalVolume = mgLogs.reduce((sum, l) =>
            sum + l.sets.reduce((s, set) => s + ((set.weight || 0) * (set.reps || 0)), 0), 0);
          const groupLabel = MUSCLE_GROUPS.find(g => g.key === selectedMuscleGroup)?.label || '';
          const mgStats = [
            { value: mgLogs.length, label: 'Exercises' },
            { value: totalSets, label: 'Sets' },
          ];
          if (totalVolume > 0) mgStats.push({ value: Math.round(totalVolume).toLocaleString(), label: 'Volume (kg)' });
          return (
            <WorkoutCelebration
              title={`${groupLabel} Complete!`}
              subtitle={selectedMuscleSession?.name}
              stats={mgStats}
              hideShare={!isPremium}
              onShareJourney={clientData ? shareToJourney : null}
              userName={clientData?.name}
              onDismissStart={() => setView('menu')}
              onDone={() => { setShowMgFinish(false); setSelectedMuscleSession(null); setSelectedMuscleGroup(null); setMgBadgeCelebration(null); }}
            />
          );
        })()}

        {/* Badge celebration overlay */}
        {mgBadgeCelebration && (
          <div className="mg-badge-celebration" onClick={() => setMgBadgeCelebration(null)}>
            <div className="mg-badge-celebration-card">
              <div className="mg-badge-celebration-icon">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="#ffc107"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </div>
              <h3 className="mg-badge-celebration-title">
                {mgBadgeCelebration.badges.length === 1 ? 'Badge Earned!' : `${mgBadgeCelebration.badges.length} Badges Earned!`}
              </h3>
              <div className="mg-badge-celebration-list">
                {mgBadgeCelebration.badges.map((badge, i) => (
                  <div key={i} className="mg-badge-celebration-item">
                    {badge.type === 'pb_target'
                      ? `${badge.exercise} \u2014 ${badge.targetWeight}kg`
                      : badge.label}
                  </div>
                ))}
              </div>
              <div className="mg-badge-share-row">
                <button className="mg-badge-share-btn" onClick={async (e) => {
                  e.stopPropagation();
                  const firstBadgeJ = mgBadgeCelebration.badges[0];
                  const badgeLabelsJ = mgBadgeCelebration.badges.map(b =>
                    b.type === 'pb_target' ? `PB Target Hit: ${b.exercise} \u2014 ${b.targetWeight}kg` : b.label
                  );
                  const badgeDefJ = BADGE_DEFS.find(d => d.id === firstBadgeJ?.id) || BADGE_DEFS.find(d => d.name === firstBadgeJ?.label);
                  await shareToJourney({
                    type: 'badge_earned',
                    title: badgeLabelsJ.length === 1 ? badgeLabelsJ[0] : `${badgeLabelsJ.length} Badges Earned!`,
                    badges: badgeLabelsJ,
                    badgeDesc: badgeDefJ?.desc,
                  });
                  showToast('Posted to Journey!', 'success');
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  Journey
                </button>
                <button className="mg-badge-share-btn" onClick={async (e) => {
                  e.stopPropagation();
                  const firstBadge = mgBadgeCelebration.badges[0];
                  const badgeLabels = mgBadgeCelebration.badges.map(b =>
                    b.type === 'pb_target' ? `PB Target Hit: ${b.exercise} \u2014 ${b.targetWeight}kg` : b.label
                  );
                  const badgeDef = BADGE_DEFS.find(d => d.id === firstBadge?.id) || BADGE_DEFS.find(d => d.name === firstBadge?.label);
                  const shareText = `Badge Earned! ${badgeLabels.join(', ')}\n#MindCoreFitness`;
                  try {
                    const blob = await generateShareImage({
                      type: 'badge',
                      title: badgeLabels.length === 1 ? badgeLabels[0] : 'Badges Earned!',
                      badges: badgeLabels,
                      badgeImage: badgeDef?.img,
                      badgeDesc: badgeDef?.desc,
                    });
                    if (navigator.share && navigator.canShare?.({ files: [new File([blob], 'badge.png', { type: 'image/png' })] })) {
                      await navigator.share({ title: 'Mind Core Fitness', text: shareText, files: [new File([blob], 'badge.png', { type: 'image/png' })] });
                    } else if (navigator.share) {
                      await navigator.share({ title: 'Mind Core Fitness', text: shareText });
                    } else {
                      await navigator.clipboard.writeText(shareText); showToast('Copied!', 'success');
                    }
                  } catch {
                    try { await navigator.clipboard.writeText(shareText); showToast('Copied!', 'success'); } catch {}
                  }
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  Share
                </button>
              </div>
              <button className="mg-badge-celebration-dismiss">Tap to dismiss</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
