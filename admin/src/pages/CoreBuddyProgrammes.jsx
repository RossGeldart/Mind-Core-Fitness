import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs, addDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { storage, db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CoreBuddyProgrammes.css';
import CoreBuddyNav from '../components/CoreBuddyNav';
import { TICKS_78_94 } from '../utils/ringTicks';

const TICK_COUNT = 60;

// Exercise group mapping for badge categorization
const EXERCISE_GROUPS = {
  'Dumbbell Floor Press': 'push', 'Seated Dumbbell Shoulder Press': 'push',
  'Seated Dumbbell Arnold Press': 'push', 'Dumbbell Overhead Tricep Extension': 'push',
  'Skullcrushers': 'push', 'Dumbbell Lateral Raise': 'push', 'Dumbbell Front Raise': 'push',
  'Dumbbell Bent Over Row': 'pull', 'Single Arm Bent Over Row': 'pull',
  'Bicep Curl': 'pull', 'Hammer Curl': 'pull',
  'Dumbbell Bent Over Rear Delt Fly': 'pull', 'Renegade Row': 'pull',
  'Dumbbell Goblet Squats': 'lower', 'Romanian Deadlifts': 'lower',
  'Forward Dumbbell Lunges': 'lower', 'Dumbbell Sumo Squats': 'lower',
  'Weighted Calf Raises': 'lower', '1 Legged RDL': 'lower',
  'Dumbbell Box Step Ups': 'lower', 'Dumbbell Squat Pulses': 'lower',
  'Dumbbell Reverse Lunges': 'lower', 'Kettlebell Romanian Deadlift': 'lower',
  'Russian Twists Dumbbell': 'core', 'Kettlebell Russian Twist': 'core',
  'Kettlebell Side Bends': 'core', 'Kneeling Kettlebell Halo': 'core',
};

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

// ==================== PROGRAMME TEMPLATES ====================
const TEMPLATES = [
  {
    id: 'fullbody_4wk',
    name: '4-Week Full Body',
    focus: 'fullbody',
    duration: 4,
    daysPerWeek: 3,
    level: 'All Levels',
    description: 'Build total body strength with compound dumbbell movements and bodyweight finishers',
    repProg: 2,
    timeProg: 5,
    days: [
      { name: 'Day 1', label: 'Push Focus', exercises: [
        { name: 'Dumbbell Floor Press', type: 'weighted', sets: 3, baseReps: 10, pbKey: 'chestPress', storagePath: 'exercises/dumbbells/upper/dumbbell floor press.mp4' },
        { name: 'Seated Dumbbell Shoulder Press', type: 'weighted', sets: 3, baseReps: 10, pbKey: 'shoulderPress', storagePath: 'exercises/dumbbells/upper/seated dumbbell shoulder press.mp4' },
        { name: 'Dumbbell Goblet Squats', type: 'weighted', sets: 3, baseReps: 10, pbKey: 'squat', storagePath: 'exercises/dumbbells/lower/dumbbell goblet squats.mp4' },
        { name: 'Press Up', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/upper/press up.mp4' },
        { name: 'Mountain Climbers', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Mountain Climbers.mp4' },
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 30, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
      ]},
      { name: 'Day 2', label: 'Pull Focus', exercises: [
        { name: 'Dumbbell Bent Over Row', type: 'weighted', sets: 3, baseReps: 10, pbKey: 'seatedRow', storagePath: 'exercises/dumbbells/upper/dumbbell bent over row.mp4' },
        { name: 'Bicep Curl', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/upper/bicep curl.mp4' },
        { name: 'Romanian Deadlifts', type: 'weighted', sets: 3, baseReps: 10, pbKey: 'deadlift', storagePath: 'exercises/dumbbells/lower/romanian deadlifts.GIF' },
        { name: 'Reverse Lunge', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/lower/reverse lunge.GIF' },
        { name: 'Russian Twist', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Russian Twist.mp4' },
        { name: 'Side Plank', type: 'timed', sets: 2, baseTime: 25, storagePath: 'exercises/bodyweight/core/Side Plank.mp4' },
      ]},
      { name: 'Day 3', label: 'Legs & Core', exercises: [
        { name: 'Forward Dumbbell Lunges', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/lower/forward dumbbell lunges.GIF' },
        { name: 'Dumbbell Sumo Squats', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/lower/dumbbell sumo squats.GIF' },
        { name: 'Weighted Calf Raises', type: 'weighted', sets: 3, baseReps: 15, storagePath: 'exercises/dumbbells/lower/weighted calf raises.GIF' },
        { name: 'Box Step Ups', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/lower/box step ups.GIF' },
        { name: 'Burpee', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/core/Burpee.mp4' },
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 30, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
      ]},
    ],
  },
  {
    id: 'fullbody_8wk',
    name: '8-Week Full Body',
    focus: 'fullbody',
    duration: 8,
    daysPerWeek: 3,
    level: 'Intermediate',
    description: 'Two-phase programme building strength and endurance across your full body',
    repProg: 1,
    timeProg: 3,
    days: [
      { name: 'Day 1', label: 'Strength', exercises: [
        { name: 'Dumbbell Goblet Squats', type: 'weighted', sets: 4, baseReps: 8, pbKey: 'squat', storagePath: 'exercises/dumbbells/lower/dumbbell goblet squats.mp4' },
        { name: 'Dumbbell Floor Press', type: 'weighted', sets: 4, baseReps: 8, pbKey: 'chestPress', storagePath: 'exercises/dumbbells/upper/dumbbell floor press.mp4' },
        { name: 'Dumbbell Bent Over Row', type: 'weighted', sets: 4, baseReps: 8, pbKey: 'seatedRow', storagePath: 'exercises/dumbbells/upper/dumbbell bent over row.mp4' },
        { name: 'Seated Dumbbell Shoulder Press', type: 'weighted', sets: 3, baseReps: 10, pbKey: 'shoulderPress', storagePath: 'exercises/dumbbells/upper/seated dumbbell shoulder press.mp4' },
        { name: 'Mountain Climbers', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Mountain Climbers.mp4' },
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 35, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
      ]},
      { name: 'Day 2', label: 'Power', exercises: [
        { name: 'Romanian Deadlifts', type: 'weighted', sets: 4, baseReps: 8, pbKey: 'deadlift', storagePath: 'exercises/dumbbells/lower/romanian deadlifts.GIF' },
        { name: 'Forward Dumbbell Lunges', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/lower/forward dumbbell lunges.GIF' },
        { name: 'Single Arm Bent Over Row', type: 'weighted', sets: 4, baseReps: 8, storagePath: 'exercises/dumbbells/upper/single arm bent over row.mp4' },
        { name: 'Hammer Curl', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/upper/hammer curl.mp4' },
        { name: 'Bulgarian Split Squats', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/lower/bulgarian split squats.GIF' },
        { name: 'Russian Twist', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Russian Twist.mp4' },
      ]},
      { name: 'Day 3', label: 'Endurance', exercises: [
        { name: 'Dumbbell Sumo Squats', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/lower/dumbbell sumo squats.GIF' },
        { name: 'Weighted Calf Raises', type: 'weighted', sets: 3, baseReps: 15, storagePath: 'exercises/dumbbells/lower/weighted calf raises.GIF' },
        { name: 'Dumbbell Overhead Tricep Extension', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/upper/dumbbell overhead tricep extension.mp4' },
        { name: 'Press Up', type: 'reps', sets: 3, baseReps: 15, storagePath: 'exercises/bodyweight/upper/press up.mp4' },
        { name: 'Burpee', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/core/Burpee.mp4' },
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 40, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
      ]},
    ],
  },
  {
    id: 'fullbody_12wk',
    name: '12-Week Full Body',
    focus: 'fullbody',
    duration: 12,
    daysPerWeek: 3,
    level: 'Advanced',
    description: 'Complete transformation programme: push, pull, and legs over three phases',
    repProg: 1,
    timeProg: 2,
    days: [
      { name: 'Day 1', label: 'Upper Push', exercises: [
        { name: 'Dumbbell Floor Press', type: 'weighted', sets: 4, baseReps: 8, pbKey: 'chestPress', storagePath: 'exercises/dumbbells/upper/dumbbell floor press.mp4' },
        { name: 'Seated Dumbbell Arnold Press', type: 'weighted', sets: 4, baseReps: 8, storagePath: 'exercises/dumbbells/upper/seated dumbbell arnold press.mp4' },
        { name: 'Dumbbell Overhead Tricep Extension', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/upper/dumbbell overhead tricep extension.mp4' },
        { name: 'Skullcrushers', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/upper/skullcrushers.mp4' },
        { name: 'Press Up', type: 'reps', sets: 3, baseReps: 15, storagePath: 'exercises/bodyweight/upper/press up.mp4' },
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 30, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
      ]},
      { name: 'Day 2', label: 'Lower Body', exercises: [
        { name: 'Dumbbell Goblet Squats', type: 'weighted', sets: 4, baseReps: 8, pbKey: 'squat', storagePath: 'exercises/dumbbells/lower/dumbbell goblet squats.mp4' },
        { name: 'Romanian Deadlifts', type: 'weighted', sets: 4, baseReps: 8, pbKey: 'deadlift', storagePath: 'exercises/dumbbells/lower/romanian deadlifts.GIF' },
        { name: 'Forward Dumbbell Lunges', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/lower/forward dumbbell lunges.GIF' },
        { name: 'Weighted Calf Raises', type: 'weighted', sets: 3, baseReps: 15, storagePath: 'exercises/dumbbells/lower/weighted calf raises.GIF' },
        { name: 'Jump Squats', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/lower/jump squats.GIF' },
        { name: 'Hollow Body Hold', type: 'timed', sets: 3, baseTime: 30, storagePath: 'exercises/bodyweight/core/Hollow Body Hold.mp4' },
      ]},
      { name: 'Day 3', label: 'Upper Pull', exercises: [
        { name: 'Dumbbell Bent Over Row', type: 'weighted', sets: 4, baseReps: 8, pbKey: 'seatedRow', storagePath: 'exercises/dumbbells/upper/dumbbell bent over row.mp4' },
        { name: 'Single Arm Bent Over Row', type: 'weighted', sets: 4, baseReps: 8, storagePath: 'exercises/dumbbells/upper/single arm bent over row.mp4' },
        { name: 'Bicep Curl', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/upper/bicep curl.mp4' },
        { name: 'Dumbbell Bent Over Rear Delt Fly', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/upper/dumbbell bent over rear delt fly.mp4' },
        { name: 'Burpee', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/core/Burpee.mp4' },
        { name: 'Side Plank', type: 'timed', sets: 2, baseTime: 25, storagePath: 'exercises/bodyweight/core/Side Plank.mp4' },
      ]},
    ],
  },
  {
    id: 'core_4wk',
    name: '4-Week Core',
    focus: 'core',
    duration: 4,
    daysPerWeek: 3,
    level: 'Beginner',
    description: 'Build a solid core foundation with targeted ab and stability work',
    repProg: 2,
    timeProg: 5,
    days: [
      { name: 'Day 1', label: 'Abs', exercises: [
        { name: 'Crunch', type: 'reps', sets: 3, baseReps: 15, storagePath: 'exercises/bodyweight/core/Crunch.mp4' },
        { name: 'Leg Raises', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/core/Leg Raises.mp4' },
        { name: 'Russian Twist', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Russian Twist.mp4' },
        { name: 'Bicycle Crunch', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Bicycle Crunch.mp4' },
        { name: 'Mountain Climbers', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Mountain Climbers.mp4' },
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 30, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
      ]},
      { name: 'Day 2', label: 'Stability', exercises: [
        { name: 'Dead Bug', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/core/Dead Bug.mp4' },
        { name: 'Bird Dog', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/core/Bird Dog.mp4' },
        { name: 'Side Plank', type: 'timed', sets: 2, baseTime: 20, storagePath: 'exercises/bodyweight/core/Side Plank.mp4' },
        { name: 'Flutter Kicks', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Flutter Kicks.mp4' },
        { name: 'Hollow Body Hold', type: 'timed', sets: 3, baseTime: 20, storagePath: 'exercises/bodyweight/core/Hollow Body Hold.mp4' },
        { name: 'High Plank Shoulder Taps', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/core/High Plank Shoulder Taps.mp4' },
      ]},
      { name: 'Day 3', label: 'Power Core', exercises: [
        { name: 'Single Leg V-Up', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/core/Single Leg V-Up.mp4' },
        { name: 'Toe Reaches', type: 'reps', sets: 3, baseReps: 15, storagePath: 'exercises/bodyweight/core/toe reaches.GIF' },
        { name: 'Russian Twists Dumbbell', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/core/russian twists dumbbell.GIF' },
        { name: 'Burpee', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/core/Burpee.mp4' },
        { name: 'Fast Mountain Climbers', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Fast Mountain Climbers.mp4' },
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 30, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
      ]},
    ],
  },
  {
    id: 'core_8wk',
    name: '8-Week Core',
    focus: 'core',
    duration: 8,
    daysPerWeek: 3,
    level: 'Intermediate',
    description: 'Develop deep core strength and rotational power over two phases',
    repProg: 1,
    timeProg: 3,
    days: [
      { name: 'Day 1', label: 'Anti-Extension', exercises: [
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 35, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
        { name: 'Dead Bug', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/core/Dead Bug.mp4' },
        { name: 'Plank Walkout', type: 'reps', sets: 3, baseReps: 8, storagePath: 'exercises/bodyweight/core/Plank Walkout.mp4' },
        { name: 'Hollow Body Hold', type: 'timed', sets: 3, baseTime: 25, storagePath: 'exercises/bodyweight/core/Hollow Body Hold.mp4' },
        { name: 'Leg Raises', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/core/Leg Raises.mp4' },
        { name: 'Mountain Climbers', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Mountain Climbers.mp4' },
      ]},
      { name: 'Day 2', label: 'Rotation', exercises: [
        { name: 'Russian Twist', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Russian Twist.mp4' },
        { name: 'Kettlebell Russian Twist', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/kettlebells/core/kettlebell russian twist.mp4' },
        { name: 'Bicycle Crunch', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Bicycle Crunch.mp4' },
        { name: 'Side Plank Rotation', type: 'reps', sets: 2, baseReps: 10, storagePath: 'exercises/bodyweight/core/Side Plank Rotation.mp4' },
        { name: 'High Plank Shoulder Taps', type: 'reps', sets: 3, baseReps: 15, storagePath: 'exercises/bodyweight/core/High Plank Shoulder Taps.mp4' },
        { name: 'Hollow Hold To V-Sit', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/core/Hollow Hold To V-sit.mp4' },
      ]},
      { name: 'Day 3', label: 'Power', exercises: [
        { name: 'Crunch', type: 'reps', sets: 4, baseReps: 15, storagePath: 'exercises/bodyweight/core/Crunch.mp4' },
        { name: 'Flutter Kicks', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Flutter Kicks.mp4' },
        { name: 'Reverse Crunch To Leg Raise', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/core/Reverse Crunch To Leg Raise.mp4' },
        { name: 'Burpee', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/core/Burpee.mp4' },
        { name: 'Kettlebell Bird Dog Drag', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/kettlebells/core/kettlebell bird dog drag.mp4' },
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 40, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
      ]},
    ],
  },
  {
    id: 'core_12wk',
    name: '12-Week Core',
    focus: 'core',
    duration: 12,
    daysPerWeek: 3,
    level: 'Advanced',
    description: 'Ultimate core transformation: stability, strength, and power across three phases',
    repProg: 1,
    timeProg: 2,
    days: [
      { name: 'Day 1', label: 'Strength', exercises: [
        { name: 'Forearm Plank', type: 'timed', sets: 4, baseTime: 30, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
        { name: 'Plank Walkout', type: 'reps', sets: 4, baseReps: 8, storagePath: 'exercises/bodyweight/core/Plank Walkout.mp4' },
        { name: 'Leg Raises', type: 'reps', sets: 4, baseReps: 12, storagePath: 'exercises/bodyweight/core/Leg Raises.mp4' },
        { name: 'Kettlebell Side Bends', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/kettlebells/core/kettlebell side bends.mp4' },
        { name: 'Dead Bug Single Leg Drop', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/core/Dead Bug Single Leg Drop.mp4' },
        { name: 'Hollow Body Hold', type: 'timed', sets: 3, baseTime: 25, storagePath: 'exercises/bodyweight/core/Hollow Body Hold.mp4' },
      ]},
      { name: 'Day 2', label: 'Endurance', exercises: [
        { name: 'Crunch', type: 'reps', sets: 4, baseReps: 15, storagePath: 'exercises/bodyweight/core/Crunch.mp4' },
        { name: 'Kettlebell Russian Twist', type: 'weighted', sets: 4, baseReps: 15, storagePath: 'exercises/kettlebells/core/kettlebell russian twist.mp4' },
        { name: 'Bicycle Crunch', type: 'reps', sets: 3, baseReps: 20, storagePath: 'exercises/bodyweight/core/Bicycle Crunch.mp4' },
        { name: 'Hollow Hold Flutter Kicks', type: 'reps', sets: 3, baseReps: 25, storagePath: 'exercises/bodyweight/core/Hollow Hold Flutter Kicks.mp4' },
        { name: 'Cross Body Mountain Climbers', type: 'reps', sets: 3, baseReps: 25, storagePath: 'exercises/bodyweight/core/Cross Body Mountain Climbers.mp4' },
        { name: 'Side Plank', type: 'timed', sets: 2, baseTime: 25, storagePath: 'exercises/bodyweight/core/Side Plank.mp4' },
      ]},
      { name: 'Day 3', label: 'Power', exercises: [
        { name: 'Hollow Hold To V-Sit', type: 'reps', sets: 4, baseReps: 10, storagePath: 'exercises/bodyweight/core/Hollow Hold To V-sit.mp4' },
        { name: 'Reverse Crunch To Leg Raise', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/core/Reverse Crunch To Leg Raise.mp4' },
        { name: 'Burpee', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/core/Burpee.mp4' },
        { name: 'Hip Dips Plank', type: 'reps', sets: 3, baseReps: 15, storagePath: 'exercises/bodyweight/core/Hip Dips Plank.mp4' },
        { name: 'Kneeling Kettlebell Halo', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/kettlebells/core/kneeling kettlebell halo.mp4' },
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 35, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
      ]},
    ],
  },
  {
    id: 'upper_4wk',
    name: '4-Week Upper Body',
    focus: 'upper',
    duration: 4,
    daysPerWeek: 3,
    level: 'Intermediate',
    description: 'Sculpt and strengthen your chest, back, shoulders, and arms',
    repProg: 2,
    timeProg: 5,
    days: [
      { name: 'Day 1', label: 'Push', exercises: [
        { name: 'Dumbbell Floor Press', type: 'weighted', sets: 4, baseReps: 10, pbKey: 'chestPress', storagePath: 'exercises/dumbbells/upper/dumbbell floor press.mp4' },
        { name: 'Seated Dumbbell Shoulder Press', type: 'weighted', sets: 3, baseReps: 10, pbKey: 'shoulderPress', storagePath: 'exercises/dumbbells/upper/seated dumbbell shoulder press.mp4' },
        { name: 'Dumbbell Overhead Tricep Extension', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/upper/dumbbell overhead tricep extension.mp4' },
        { name: 'Tricep Dips', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/upper/tricep dips.mp4' },
        { name: 'Pike Push Ups', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/upper/pike push ups.GIF' },
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 30, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
      ]},
      { name: 'Day 2', label: 'Pull', exercises: [
        { name: 'Dumbbell Bent Over Row', type: 'weighted', sets: 4, baseReps: 10, pbKey: 'seatedRow', storagePath: 'exercises/dumbbells/upper/dumbbell bent over row.mp4' },
        { name: 'Single Arm Bent Over Row', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/upper/single arm bent over row.mp4' },
        { name: 'Dumbbell Bent Over Rear Delt Fly', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/upper/dumbbell bent over rear delt fly.mp4' },
        { name: 'Bicep Curl', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/upper/bicep curl.mp4' },
        { name: 'Hammer Curl', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/upper/hammer curl.mp4' },
        { name: 'Reverse Plank', type: 'timed', sets: 3, baseTime: 20, storagePath: 'exercises/bodyweight/upper/reverse plank.GIF' },
      ]},
      { name: 'Day 3', label: 'Mixed', exercises: [
        { name: 'Seated Dumbbell Arnold Press', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/upper/seated dumbbell arnold press.mp4' },
        { name: 'Dumbbell Lateral Raise', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/upper/dumbbell lateral raise.mp4' },
        { name: 'Dumbbell Front Raise', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/upper/dumbbell front raise.mp4' },
        { name: 'Press Up', type: 'reps', sets: 3, baseReps: 15, storagePath: 'exercises/bodyweight/upper/press up.mp4' },
        { name: 'Renegade Row', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/upper/renegade row.mp4' },
        { name: 'Superman Hold', type: 'timed', sets: 3, baseTime: 30, storagePath: 'exercises/bodyweight/core/Superman Hold.mp4' },
      ]},
    ],
  },
  {
    id: 'lower_4wk',
    name: '4-Week Lower Body',
    focus: 'lower',
    duration: 4,
    daysPerWeek: 3,
    level: 'Intermediate',
    description: 'Build powerful legs and glutes with squats, deadlifts, and plyometrics',
    repProg: 2,
    timeProg: 5,
    days: [
      { name: 'Day 1', label: 'Quad Dominant', exercises: [
        { name: 'Dumbbell Goblet Squats', type: 'weighted', sets: 4, baseReps: 10, pbKey: 'squat', storagePath: 'exercises/dumbbells/lower/dumbbell goblet squats.mp4' },
        { name: 'Forward Dumbbell Lunges', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/lower/forward dumbbell lunges.GIF' },
        { name: 'Dumbbell Box Step Ups', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/lower/dumbbell box step ups.mp4' },
        { name: 'Dumbbell Squat Pulses', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/lower/dumbbell squat pulses.GIF' },
        { name: 'Jump Squats', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/lower/jump squats.GIF' },
        { name: 'Squat And Hold', type: 'timed', sets: 3, baseTime: 30, storagePath: 'exercises/bodyweight/lower/squat and hold.GIF' },
      ]},
      { name: 'Day 2', label: 'Hamstring & Glute', exercises: [
        { name: 'Romanian Deadlifts', type: 'weighted', sets: 4, baseReps: 8, pbKey: 'deadlift', storagePath: 'exercises/dumbbells/lower/romanian deadlifts.GIF' },
        { name: '1 Legged RDL', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/lower/1 legged rdl.GIF' },
        { name: 'Hip Thrusts', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/lower/hip thrusts.GIF' },
        { name: 'Dumbbell Reverse Lunges', type: 'weighted', sets: 3, baseReps: 12, storagePath: 'exercises/dumbbells/lower/dumbbell reverse lunges.GIF' },
        { name: 'Donkey Kicks', type: 'reps', sets: 3, baseReps: 15, storagePath: 'exercises/bodyweight/lower/donkey kicks.GIF' },
        { name: 'Forearm Plank', type: 'timed', sets: 3, baseTime: 30, pbKey: 'plank', storagePath: 'exercises/bodyweight/core/Forearm Plank.mp4' },
      ]},
      { name: 'Day 3', label: 'Power & Stability', exercises: [
        { name: 'Dumbbell Sumo Squats', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/dumbbells/lower/dumbbell sumo squats.GIF' },
        { name: 'Kettlebell Romanian Deadlift', type: 'weighted', sets: 3, baseReps: 10, storagePath: 'exercises/kettlebells/lower/kettlebell romanian deadlift.mp4' },
        { name: 'Weighted Calf Raises', type: 'weighted', sets: 3, baseReps: 15, storagePath: 'exercises/dumbbells/lower/weighted calf raises.GIF' },
        { name: 'Bulgarian Split Squats', type: 'reps', sets: 3, baseReps: 10, storagePath: 'exercises/bodyweight/lower/bulgarian split squats.GIF' },
        { name: 'Skater Jumps', type: 'reps', sets: 3, baseReps: 12, storagePath: 'exercises/bodyweight/lower/skater jumps.GIF' },
        { name: 'Side Plank', type: 'timed', sets: 2, baseTime: 25, storagePath: 'exercises/bodyweight/core/Side Plank.mp4' },
      ]},
    ],
  },
];

// Compute exercise targets for a given week
function getWeekTargets(exercise, weekNum, template) {
  const reps = exercise.baseReps ? exercise.baseReps + (weekNum - 1) * (template.repProg || 0) : undefined;
  const time = exercise.baseTime ? exercise.baseTime + (weekNum - 1) * (template.timeProg || 0) : undefined;
  return { sets: exercise.sets, reps, time };
}

// Focus icons
const FOCUS_ICONS = {
  fullbody: 'M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zm-2 8h4l1 4h2l-1 4h-2l-1 4h-2l-1-4H8l-1-4h2l1-4z',
  core: 'M12 2a4 4 0 0 1 4 4v1h-2V6a2 2 0 1 0-4 0v1H8V6a4 4 0 0 1 4-4zM8 9h8v2H8V9zm-1 4h10l-1 9H8l-1-9z',
  upper: 'M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zm8 10l-3-1.5c-.5-.25-1-.5-1.5-.5h-7c-.5 0-1 .25-1.5.5L4 12l-2 6h4l1.5 4h9L18 18h4l-2-6z',
  lower: 'M16.5 3A2.5 2.5 0 0 0 14 5.5 2.5 2.5 0 0 0 16.5 8 2.5 2.5 0 0 0 19 5.5 2.5 2.5 0 0 0 16.5 3zM14 9l-3 7h2l1 6h2l1-6h2l-3-7h-2z',
};

export default function CoreBuddyProgrammes() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme, accent } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // Views: 'loading' | 'browse' | 'overview' | 'dashboard' | 'session' | 'sessionComplete'
  const [view, setView] = useState('loading');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const didAutoSelectRef = useRef(false);

  // Active programme state
  const [activeProgramme, setActiveProgramme] = useState(null); // { templateId, startDate, completedSessions }

  // Session state
  const [sessionWeek, setSessionWeek] = useState(1);
  const [sessionDay, setSessionDay] = useState(0);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [currentSetIdx, setCurrentSetIdx] = useState(0);
  const [sessionLogs, setSessionLogs] = useState([]); // [{name, type, sets: [{weight?, reps?, time?}]}]
  const [weightInput, setWeightInput] = useState('');
  const [repsInput, setRepsInput] = useState('');

  // Timer for timed exercises
  const [timerActive, setTimerActive] = useState(false);
  const [timerValue, setTimerValue] = useState(0);
  const timerRef = useRef(null);

  // Video URLs and player state
  const [videoUrls, setVideoUrls] = useState({});
  const [videoPlaying, setVideoPlaying] = useState(false);
  const sessionVideoRef = useRef(null);

  // Badge celebration state
  const [badgeCelebration, setBadgeCelebration] = useState(null); // { badges: [...] }
  const [sessionBadges, setSessionBadges] = useState([]); // badges earned during this session

  // Scroll to top on view change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Audio
  const audioCtxRef = useRef(null);
  const getAudioCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtxRef.current;
  };
  const playBeep = () => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 1200; gain.gain.value = 0.4;
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  };

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load active programme on mount
  useEffect(() => {
    if (!clientData) return;
    const load = async () => {
      try {
        const docRef = doc(db, 'clientProgrammes', clientData.id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setActiveProgramme(snap.data());
          setView('dashboard');
        } else {
          setView('browse');
        }
      } catch (err) {
        console.error('Error loading programme:', err);
        setView('browse');
      }
    };
    load();
  }, [clientData]);

  // Auto-select template if navigated with state (from workouts page carousel)
  // Must run after loading completes (view !== 'loading') and override dashboard view
  useEffect(() => {
    if (didAutoSelectRef.current) return;
    if (view === 'loading') return;
    const templateId = location.state?.templateId;
    if (!templateId) return;
    const template = TEMPLATES.find(t => t.id === templateId);
    if (template) {
      didAutoSelectRef.current = true;
      setSelectedTemplate(template);
      setView('overview');
    }
  }, [view, location.state]);

  // Timer countdown effect
  useEffect(() => {
    if (!timerActive || timerValue <= 0) {
      if (timerActive && timerValue <= 0) {
        setTimerActive(false);
        playBeep();
      }
      return;
    }
    timerRef.current = setTimeout(() => setTimerValue(v => v - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [timerActive, timerValue]);

  // Save programme to Firestore
  const saveProgramme = async (data) => {
    if (!clientData) return;
    try {
      await setDoc(doc(db, 'clientProgrammes', clientData.id), data);
      setActiveProgramme(data);
    } catch (err) {
      console.error('Error saving programme:', err);
      showToast('Failed to save. Check Firestore rules for clientProgrammes.', 'error');
    }
  };

  // Start a programme
  const startProgramme = async (template) => {
    const data = {
      templateId: template.id,
      startDate: Timestamp.now(),
      completedSessions: {},
    };
    await saveProgramme(data);
    setView('dashboard');
  };

  // Quit programme
  const quitProgramme = async () => {
    if (!clientData) return;
    try {
      await deleteDoc(doc(db, 'clientProgrammes', clientData.id));
      setActiveProgramme(null);
      setView('browse');
    } catch (err) {
      console.error('Error quitting programme:', err);
    }
  };

  // Get active template
  const getActiveTemplate = () => {
    if (!activeProgramme) return null;
    return TEMPLATES.find(t => t.id === activeProgramme.templateId);
  };

  // Calculate current week and next session
  const getProgress = () => {
    if (!activeProgramme) return { currentWeek: 1, completedThisWeek: 0, nextDay: 0, totalCompleted: 0 };
    const completed = activeProgramme.completedSessions || {};
    const totalCompleted = Object.keys(completed).length;
    const template = getActiveTemplate();
    if (!template) return { currentWeek: 1, completedThisWeek: 0, nextDay: 0, totalCompleted: 0 };

    const totalSessions = template.duration * template.daysPerWeek;
    const currentWeek = Math.min(Math.floor(totalCompleted / template.daysPerWeek) + 1, template.duration);
    const completedThisWeek = totalCompleted - (currentWeek - 1) * template.daysPerWeek;

    // Find next uncompleted session
    for (let w = 1; w <= template.duration; w++) {
      for (let d = 0; d < template.daysPerWeek; d++) {
        const key = `w${w}d${d}`;
        if (!completed[key]) {
          return { currentWeek: w, completedThisWeek, nextDay: d, nextWeek: w, totalCompleted, totalSessions };
        }
      }
    }
    return { currentWeek: template.duration, completedThisWeek: template.daysPerWeek, nextDay: -1, totalCompleted, totalSessions, complete: true };
  };

  // Get last week's data for an exercise (for auto-fill)
  const getLastWeekData = (week, dayIdx, exerciseName) => {
    if (!activeProgramme || week <= 1) return null;
    const prevKey = `w${week - 1}d${dayIdx}`;
    const prevSession = activeProgramme.completedSessions?.[prevKey];
    if (!prevSession) return null;
    const prevEx = prevSession.exercises?.find(e => e.name === exerciseName);
    if (!prevEx?.sets?.length) return null;
    return prevEx.sets[prevEx.sets.length - 1];
  };

  // Start a session
  const startSession = (week, dayIdx) => {
    const template = getActiveTemplate();
    if (!template) return;
    setSessionWeek(week);
    setSessionDay(dayIdx);
    setCurrentExIdx(0);
    setCurrentSetIdx(0);
    setSessionLogs([]);
    setRepsInput('');
    setTimerActive(false);
    setTimerValue(0);
    setVideoPlaying(false);
    setVideoUrls({});

    // Pre-init session logs structure
    const day = template.days[dayIdx];
    const targets = day.exercises.map(ex => {
      const t = getWeekTargets(ex, week, template);
      return { name: ex.name, type: ex.type, pbKey: ex.pbKey, targetSets: t.sets, targetReps: t.reps, targetTime: t.time, sets: [] };
    });
    setSessionLogs(targets);

    // Auto-fill weight from last week for the first exercise
    const firstEx = day.exercises[0];
    const lastData = getLastWeekData(week, dayIdx, firstEx.name);
    if (lastData?.weight && firstEx.type === 'weighted') {
      setWeightInput(String(lastData.weight));
    } else {
      setWeightInput('');
    }

    // Fetch video URLs for all exercises in this session
    const fetchVideos = async () => {
      const urls = {};
      for (const ex of day.exercises) {
        if (ex.storagePath) {
          try {
            const storageRef = ref(storage, ex.storagePath);
            const url = await getDownloadURL(storageRef);
            urls[ex.name] = { url, isGif: /\.gif$/i.test(ex.storagePath) };
          } catch (err) {
            console.warn(`Video not found for ${ex.name}:`, err);
          }
        }
      }
      setVideoUrls(urls);
    };
    fetchVideos();

    setView('session');
  };

  // Log a set
  const logSet = async () => {
    const template = getActiveTemplate();
    const exLog = sessionLogs[currentExIdx];
    if (!exLog) return;

    let setData = {};
    if (exLog.type === 'weighted') {
      const w = parseFloat(weightInput) || 0;
      const r = parseInt(repsInput) || 0;
      if (r === 0) { showToast('Enter your reps', 'error'); return; }
      setData = { weight: w, reps: r };
    } else if (exLog.type === 'reps') {
      const r = parseInt(repsInput) || 0;
      if (r === 0) { showToast('Enter your reps', 'error'); return; }
      setData = { reps: r };
    } else if (exLog.type === 'timed') {
      const elapsed = exLog.targetTime - timerValue;
      setData = { time: Math.max(elapsed, 1) };
    }

    // Update session logs
    const updated = [...sessionLogs];
    updated[currentExIdx] = { ...exLog, sets: [...exLog.sets, setData] };
    setSessionLogs(updated);

    // Check PB for weighted exercises (tracked by exercise name)
    if (exLog.type === 'weighted' && setData.weight > 0) {
      await checkPB(exLog.name, setData.weight, setData.reps);
    }

    // Advance to next set or next exercise
    const nextSet = exLog.sets.length + 1; // +1 because we just added one
    if (nextSet < exLog.targetSets) {
      setCurrentSetIdx(nextSet);
      setWeightInput(setData.weight ? String(setData.weight) : '');
      setRepsInput('');
      setTimerActive(false);
      setTimerValue(0);
    } else {
      // Move to next exercise
      if (currentExIdx + 1 < sessionLogs.length) {
        const nextExIdx = currentExIdx + 1;
        setCurrentExIdx(nextExIdx);
        setCurrentSetIdx(0);
        setVideoPlaying(false);

        // Auto-fill weight from last week for the next exercise
        const template = getActiveTemplate();
        const nextEx = template?.days[sessionDay]?.exercises[nextExIdx];
        const lastData = getLastWeekData(sessionWeek, sessionDay, nextEx?.name);
        if (lastData?.weight && nextEx?.type === 'weighted') {
          setWeightInput(String(lastData.weight));
        } else {
          setWeightInput('');
        }

        setRepsInput('');
        setTimerActive(false);
        setTimerValue(0);
      } else {
        // Session complete
        await completeSession(updated);
      }
    }
  };

  // Complete session - save to Firestore
  const completeSession = async (logs) => {
    if (!activeProgramme || !clientData) return;
    const key = `w${sessionWeek}d${sessionDay}`;
    const completedSessions = {
      ...activeProgramme.completedSessions,
      [key]: {
        completedAt: new Date().toISOString(),
        exercises: logs.map(l => ({
          name: l.name,
          type: l.type,
          sets: l.sets,
        })),
      },
    };
    const updated = { ...activeProgramme, completedSessions };
    await saveProgramme(updated);

    // Calculate session volume (weight × reps for all weighted exercises)
    const sessionVolume = logs.reduce((sum, l) =>
      sum + l.sets.reduce((s, set) => s + ((set.weight || 0) * (set.reps || 0)), 0), 0);

    // Update total volume and check milestones
    if (sessionVolume > 0) {
      await updateVolume(sessionVolume);
    }

    // Also log to workoutLogs for the randomiser stats
    try {
      const template = getActiveTemplate();
      await addDoc(collection(db, 'workoutLogs'), {
        clientId: clientData.id,
        type: 'programme',
        programmeId: template?.id,
        programmeName: template?.name,
        week: sessionWeek,
        day: sessionDay + 1,
        exerciseCount: logs.length,
        duration: Math.round(logs.reduce((sum, l) => sum + l.sets.length * 1.5, 0)),
        volume: Math.round(sessionVolume),
        completedAt: Timestamp.now(),
      });
    } catch (err) {
      console.error('Error saving workout log:', err);
    }

    // Show badge celebration if any badges earned during session
    if (sessionBadges.length > 0) {
      setBadgeCelebration({ badges: [...sessionBadges] });
      setSessionBadges([]);
    }

    setView('sessionComplete');
  };

  // Update cumulative volume and check milestone badges
  const updateVolume = async (sessionVolume) => {
    if (!clientData) return;
    try {
      const achDoc = await getDoc(doc(db, 'coreBuddyAchievements', clientData.id));
      const achData = achDoc.exists() ? achDoc.data() : { clientId: clientData.id, badges: [], totalVolume: 0 };
      const oldVolume = achData.totalVolume || 0;
      const newVolume = oldVolume + sessionVolume;

      // Check for new volume milestone badges
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

      // Add milestone badges to session celebration
      if (newMilestoneBadges.length > 0) {
        setSessionBadges(prev => [...prev, ...newMilestoneBadges]);
      }
    } catch (err) {
      console.error('Error updating volume:', err);
    }
  };

  // Check and update PB (all-time bests stored by exercise name)
  // Also checks targets and awards badges
  const checkPB = async (exerciseName, weight, reps) => {
    if (!clientData) return;
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
        showToast(`New PB! ${weight}kg × ${reps} reps`, 'success');
        playBeep();

        // Check if this PB hits a target → award badge
        await checkTargetBadge(exerciseName, weight);
      }
    } catch (err) {
      console.error('Error checking PB:', err);
    }
  };

  // Check if new PB weight meets/exceeds a target and award badge
  const checkTargetBadge = async (exerciseName, newWeight) => {
    if (!clientData) return;
    try {
      const targetDoc = await getDoc(doc(db, 'coreBuddyTargets', clientData.id));
      if (!targetDoc.exists()) return;
      const targets = targetDoc.data().targets || {};
      const target = targets[exerciseName];
      if (!target || newWeight < target.targetWeight) return;

      // Check if badge already earned
      const achDoc = await getDoc(doc(db, 'coreBuddyAchievements', clientData.id));
      const achData = achDoc.exists() ? achDoc.data() : { clientId: clientData.id, badges: [], totalVolume: 0 };
      const alreadyEarned = achData.badges.some(
        b => b.type === 'pb_target' && b.exercise === exerciseName && b.targetWeight === target.targetWeight
      );
      if (alreadyEarned) return;

      // Award the badge
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

      // Track for session celebration
      setSessionBadges(prev => [...prev, newBadge]);
    } catch (err) {
      console.error('Error checking target badge:', err);
    }
  };

  // Toast element
  const toastEl = toast && (
    <div className={`toast-notification ${toast.type}`}>
      {toast.type === 'success' && <span>🏆 </span>}
      {toast.message}
    </div>
  );

  // Header
  const renderHeader = (title, onBack) => (
    <header className="client-header">
      <div className="header-content">
        <button className="header-back-btn" onClick={onBack} aria-label="Go back">
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
  );

  if (authLoading || view === 'loading') {
    return <div className="cb-loading"><div className="cb-loading-spinner" /></div>;
  }

  // ==================== BROWSE VIEW ====================
  if (view === 'browse') {
    return (
      <div className="pg-page" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        {renderHeader('Programmes', () => navigate('/client/core-buddy/workouts'))}
        <main className="pg-main">
          <p className="pg-browse-intro">Choose a programme and start your journey</p>
          <div className="pg-browse-grid">
            {TEMPLATES.map((t, i) => (
              <button key={t.id} className="pg-browse-card" onClick={() => { setSelectedTemplate(t); setView('overview'); }}
                style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="pg-browse-card-top">
                  <svg className="pg-browse-icon" viewBox="0 0 24 24" fill="currentColor"><path d={FOCUS_ICONS[t.focus]} /></svg>
                  <span className="pg-browse-duration">{t.duration} WK</span>
                </div>
                <h3 className="pg-browse-name">{t.name}</h3>
                <span className="pg-browse-level">{t.level}</span>
                <p className="pg-browse-desc">{t.description}</p>
                <div className="pg-browse-meta">
                  <span>{t.daysPerWeek}× per week</span>
                  <span>{t.days[0].exercises.length} exercises</span>
                </div>
              </button>
            ))}
          </div>
        </main>
        <CoreBuddyNav active="workouts" />
        {toastEl}
      </div>
    );
  }

  // ==================== OVERVIEW VIEW ====================
  if (view === 'overview' && selectedTemplate) {
    const t = selectedTemplate;
    return (
      <div className="pg-page" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        {renderHeader(t.name, () => setView('browse'))}
        <main className="pg-main">
          <div className="pg-overview-hero">
            <svg className="pg-overview-icon" viewBox="0 0 24 24" fill="currentColor"><path d={FOCUS_ICONS[t.focus]} /></svg>
            <h2 className="pg-overview-name">{t.name}</h2>
            <p className="pg-overview-desc">{t.description}</p>
            <div className="pg-overview-stats">
              <div className="pg-ov-stat">
                <span className="pg-ov-stat-num">{t.duration}</span>
                <span className="pg-ov-stat-label">Weeks</span>
              </div>
              <div className="pg-ov-stat">
                <span className="pg-ov-stat-num">{t.daysPerWeek}</span>
                <span className="pg-ov-stat-label">Days/Week</span>
              </div>
              <div className="pg-ov-stat">
                <span className="pg-ov-stat-num">{t.duration * t.daysPerWeek}</span>
                <span className="pg-ov-stat-label">Sessions</span>
              </div>
            </div>
          </div>

          <div className="pg-overview-days">
            {t.days.map((day, di) => (
              <div key={di} className="pg-day-card">
                <div className="pg-day-header">
                  <span className="pg-day-name">{day.name}</span>
                  <span className="pg-day-label">{day.label}</span>
                </div>
                <div className="pg-day-exercises">
                  {day.exercises.map((ex, ei) => {
                    const targets = getWeekTargets(ex, 1, t);
                    return (
                      <div key={ei} className="pg-day-ex">
                        <span className="pg-day-ex-name">{ex.name}</span>
                        <span className="pg-day-ex-target">
                          {ex.type === 'timed' ? `${targets.sets}×${targets.time}s` : `${targets.sets}×${targets.reps}`}
                        </span>
                        <span className={`pg-day-ex-badge pg-badge-${ex.type}`}>
                          {ex.type === 'weighted' ? 'WT' : ex.type === 'timed' ? 'TMR' : 'BW'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="pg-overview-note">
            <strong>Progressive Overload:</strong> +{t.repProg} reps/week{t.timeProg ? `, +${t.timeProg}s/week for timed` : ''}
          </div>

          <button className="pg-start-btn" onClick={() => startProgramme(t)}>
            Start Programme
          </button>
        </main>
        {toastEl}
      </div>
    );
  }

  // ==================== DASHBOARD VIEW ====================
  if (view === 'dashboard') {
    const template = getActiveTemplate();
    if (!template) { setView('browse'); return null; }
    const progress = getProgress();
    const completed = activeProgramme?.completedSessions || {};
    const progressPct = progress.totalSessions ? Math.round((progress.totalCompleted / progress.totalSessions) * 100) : 0;
    const ringFilled = Math.round((progress.totalCompleted / (progress.totalSessions || 1)) * TICK_COUNT);

    return (
      <div className="pg-page" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        {renderHeader('Programme', () => navigate('/client/core-buddy/workouts'))}
        <main className="pg-main">
          {/* Progress Ring */}
          <div className="pg-dash-hero">
            <div className="pg-dash-ring-wrap">
              <svg className="pg-dash-ring-svg" viewBox="0 0 200 200">
                {TICKS_78_94.map((t, i) => (
                  <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                    className={i < ringFilled ? 'pg-tick-filled' : 'pg-tick-empty'}
                    strokeWidth={t.thick ? '3' : '2'} />
                ))}
              </svg>
              <img src="/Logo.webp" alt="Mind Core Fitness" className="pg-dash-ring-logo" width="50" height="50" />
            </div>
            <h2 className="pg-dash-name">{template.name}</h2>
            <div className="pg-dash-progress-text">
              <span className="pg-dash-pct">{progressPct}%</span>
              <span className="pg-dash-week">Week {progress.currentWeek} of {template.duration}</span>
            </div>
          </div>

          {/* Weekly Grid */}
          <div className="pg-weeks">
            {Array.from({ length: template.duration }, (_, w) => {
              const weekNum = w + 1;
              return (
                <div key={w} className={`pg-week-row${weekNum === progress.currentWeek ? ' pg-week-current' : ''}`}>
                  <span className="pg-week-label">W{weekNum}</span>
                  <div className="pg-week-days">
                    {template.days.map((day, d) => {
                      const key = `w${weekNum}d${d}`;
                      const isDone = !!completed[key];
                      const isNext = !progress.complete && weekNum === progress.nextWeek && d === progress.nextDay;
                      return (
                        <button key={d}
                          className={`pg-day-dot${isDone ? ' done' : ''}${isNext ? ' next' : ''}`}
                          disabled={isDone}
                          onClick={() => { if (isNext) startSession(weekNum, d); }}>
                          {isDone ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                          ) : (
                            <span>{day.name.replace('Day ', '')}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Next Session Card */}
          {!progress.complete && progress.nextDay >= 0 && (
            <div className="pg-next-session">
              <h3>Next Session</h3>
              <p className="pg-next-info">
                Week {progress.nextWeek} — {template.days[progress.nextDay].name}: {template.days[progress.nextDay].label}
              </p>
              <div className="pg-next-exercises">
                {template.days[progress.nextDay].exercises.map((ex, i) => {
                  const t = getWeekTargets(ex, progress.nextWeek, template);
                  return (
                    <div key={i} className="pg-next-ex">
                      <span className="pg-next-ex-name">{ex.name}</span>
                      <span className="pg-next-ex-target">
                        {ex.type === 'timed' ? `${t.sets}×${t.time}s` : `${t.sets}×${t.reps}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button className="pg-start-btn" onClick={() => startSession(progress.nextWeek, progress.nextDay)}>
                Start Session
              </button>
            </div>
          )}

          {progress.complete && (
            <div className="pg-complete-msg">
              <h3>Programme Complete! 🎉</h3>
              <p>You finished all {progress.totalSessions} sessions.</p>
              <button className="pg-start-btn" onClick={quitProgramme}>Choose New Programme</button>
            </div>
          )}

          <button className="pg-quit-btn" onClick={() => { if (confirm('Quit this programme? Progress will be lost.')) quitProgramme(); }}>
            Quit Programme
          </button>
        </main>
        <CoreBuddyNav active="workouts" />
        {toastEl}
      </div>
    );
  }

  // ==================== SESSION VIEW ====================
  if (view === 'session') {
    const template = getActiveTemplate();
    if (!template) return null;
    const day = template.days[sessionDay];
    const exercise = day.exercises[currentExIdx];
    const targets = getWeekTargets(exercise, sessionWeek, template);
    const exLog = sessionLogs[currentExIdx];
    const completedSets = exLog?.sets?.length || 0;
    const totalExercises = day.exercises.length;
    const overallProgress = ((currentExIdx + completedSets / targets.sets) / totalExercises);
    const videoData = videoUrls[exercise.name];
    const lastWeekData = getLastWeekData(sessionWeek, sessionDay, exercise.name);

    // For timed exercises, initialize timer value when entering new exercise/set
    if (exercise.type === 'timed' && timerValue === 0 && !timerActive && completedSets === currentSetIdx) {
      // Set timer to target time on first render of this set
      setTimeout(() => setTimerValue(targets.time), 0);
    }

    const toggleVideo = () => {
      if (videoData?.isGif) {
        setVideoPlaying(!videoPlaying);
      } else if (sessionVideoRef.current) {
        if (videoPlaying) {
          sessionVideoRef.current.pause();
        } else {
          sessionVideoRef.current.play();
        }
        setVideoPlaying(!videoPlaying);
      }
    };

    return (
      <div className="pg-page pg-page-session" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        {/* Progress bar */}
        <div className="pg-session-progress">
          <div className="pg-session-progress-fill" style={{ width: `${overallProgress * 100}%` }} />
        </div>

        {/* Exercise Header */}
        <div className="pg-session-header">
          <button className="pg-session-back" onClick={() => {
            if (confirm('Leave session? Progress will be lost.')) setView('dashboard');
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div className="pg-session-title">
            <span className="pg-session-counter">{currentExIdx + 1} / {totalExercises}</span>
            <span className="pg-session-week">Week {sessionWeek} · {day.name}</span>
          </div>
        </div>

        {/* Video Demo */}
        {videoData && (
          <div className="pg-video-container" onClick={toggleVideo}>
            {videoData.isGif ? (
              <img className="pg-video" src={videoData.url} alt={exercise.name} />
            ) : (
              <video ref={sessionVideoRef} key={exercise.name} className="pg-video" src={videoData.url} loop muted playsInline />
            )}
            {!videoPlaying && (
              <div className="pg-video-overlay">
                <svg className="pg-play-icon" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span className="pg-video-hint">Tap for demo</span>
              </div>
            )}
          </div>
        )}

        {/* Spotify Player */}
        <div className="pg-spotify">
          <iframe
            src="https://open.spotify.com/embed/playlist/37i9dQZF1DZ06evO3FJyYF?utm_source=generator&theme=0"
            width="100%" height="80" frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy" title="Spotify Playlist" />
        </div>

        {/* Exercise Card */}
        <div className="pg-exercise-card">
          <h2 className="pg-ex-name">{exercise.name}</h2>
          <span className={`pg-ex-type-badge pg-badge-${exercise.type}`}>
            {exercise.type === 'weighted' ? 'Weight + Reps' : exercise.type === 'timed' ? 'Timed' : 'Reps Only'}
          </span>

          {/* Last week reference */}
          {exercise.type === 'weighted' && lastWeekData && (
            <div className="pg-last-week">
              <span className="pg-last-week-label">Last week:</span>
              <span className="pg-last-week-value">{lastWeekData.weight}kg x {lastWeekData.reps} reps</span>
            </div>
          )}

          <div className="pg-ex-set-info">
            <span className="pg-ex-set-num">Set {completedSets + 1} of {targets.sets}</span>
            <span className="pg-ex-target">
              Target: {exercise.type === 'timed' ? `${targets.time}s hold` : `${targets.reps} reps`}
            </span>
          </div>

          {/* Input Area - varies by type */}
          {exercise.type === 'weighted' && (
            <div className="pg-input-area">
              <div className="pg-input-group">
                <label>Weight (kg)</label>
                <input type="number" inputMode="decimal" value={weightInput}
                  onChange={e => setWeightInput(e.target.value)} placeholder="0" className="pg-input" />
              </div>
              <div className="pg-input-group">
                <label>Reps</label>
                <input type="number" inputMode="numeric" value={repsInput}
                  onChange={e => setRepsInput(e.target.value)} placeholder={String(targets.reps)} className="pg-input" />
              </div>
            </div>
          )}

          {exercise.type === 'reps' && (
            <div className="pg-input-area">
              <div className="pg-input-group pg-input-single">
                <label>Reps</label>
                <input type="number" inputMode="numeric" value={repsInput}
                  onChange={e => setRepsInput(e.target.value)} placeholder={String(targets.reps)} className="pg-input" />
              </div>
            </div>
          )}

          {exercise.type === 'timed' && (
            <div className="pg-timer-area">
              <div className="pg-timer-display">
                <span className="pg-timer-value">{timerValue}s</span>
              </div>
              {!timerActive ? (
                <button className="pg-timer-btn" onClick={() => {
                  if (timerValue === 0) setTimerValue(targets.time);
                  setTimerActive(true);
                }}>
                  {timerValue < targets.time && timerValue > 0 ? 'Resume' : 'Start Timer'}
                </button>
              ) : (
                <button className="pg-timer-btn pg-timer-stop" onClick={() => setTimerActive(false)}>
                  Stop
                </button>
              )}
            </div>
          )}

          <button className="pg-log-set-btn" onClick={logSet}
            disabled={exercise.type === 'timed' && timerActive}>
            {completedSets + 1 < targets.sets ? 'Log Set' :
              currentExIdx + 1 < totalExercises ? 'Log Set → Next Exercise' : 'Log Set → Complete'}
          </button>

          {/* Completed sets for this exercise */}
          {exLog?.sets?.length > 0 && (
            <div className="pg-completed-sets">
              {exLog.sets.map((s, i) => (
                <div key={i} className="pg-completed-set">
                  <span className="pg-completed-set-check">✓</span>
                  <span>Set {i + 1}: {
                    s.weight !== undefined ? `${s.weight}kg × ${s.reps}` :
                    s.time !== undefined ? `${s.time}s` :
                    `${s.reps} reps`
                  }</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {toastEl}
      </div>
    );
  }

  // ==================== SESSION COMPLETE VIEW ====================
  if (view === 'sessionComplete') {
    const template = getActiveTemplate();
    const day = template?.days[sessionDay];
    const totalSets = sessionLogs.reduce((sum, l) => sum + l.sets.length, 0);
    const totalVolume = sessionLogs.reduce((sum, l) =>
      sum + l.sets.reduce((s, set) => s + ((set.weight || 0) * (set.reps || 0)), 0), 0);

    return (
      <div className="pg-page pg-page-center" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
        <div className="pg-session-done">
          {/* Completion ring */}
          <div className="pg-done-ring">
            <svg className="pg-done-ring-svg" viewBox="0 0 200 200">
              {TICKS_78_94.map((t, i) => (
                <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                  className="pg-tick-complete"
                  strokeWidth={t.thick ? '3.5' : '2'}
                  style={{ animationDelay: `${i * 0.02}s` }} />
              ))}
            </svg>
            <div className="pg-done-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
          </div>

          <h2 className="pg-done-title">Session Complete!</h2>
          <p className="pg-done-subtitle">
            Week {sessionWeek} — {day?.name}: {day?.label}
          </p>

          <div className="pg-done-stats">
            <div className="pg-done-stat">
              <span className="pg-done-stat-num">{sessionLogs.length}</span>
              <span className="pg-done-stat-label">Exercises</span>
            </div>
            <div className="pg-done-stat">
              <span className="pg-done-stat-num">{totalSets}</span>
              <span className="pg-done-stat-label">Sets</span>
            </div>
            {totalVolume > 0 && (
              <div className="pg-done-stat">
                <span className="pg-done-stat-num">{Math.round(totalVolume).toLocaleString()}</span>
                <span className="pg-done-stat-label">Volume (kg)</span>
              </div>
            )}
          </div>

          <button className="pg-start-btn" onClick={() => setView('dashboard')}>
            Back to Programme
          </button>
        </div>

        {/* Badge Celebration Overlay */}
        {badgeCelebration && (
          <div className="pg-badge-celebration" onClick={() => setBadgeCelebration(null)}>
            <div className="pg-badge-celebration-card" onClick={e => e.stopPropagation()}>
              <div className="pg-badge-celebration-icon">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </div>
              <h3 className="pg-badge-celebration-title">
                {badgeCelebration.badges.length === 1 ? 'Badge Earned!' : `${badgeCelebration.badges.length} Badges Earned!`}
              </h3>
              <div className="pg-badge-celebration-list">
                {badgeCelebration.badges.map((badge, i) => (
                  <div key={i} className="pg-badge-celebration-item">
                    {badge.type === 'pb_target'
                      ? `${badge.exercise} — ${badge.targetWeight}kg`
                      : badge.label}
                  </div>
                ))}
              </div>
              <button className="pg-badge-celebration-dismiss" onClick={() => setBadgeCelebration(null)}>
                Tap to dismiss
              </button>
            </div>
          </div>
        )}

        {toastEl}
      </div>
    );
  }

  return null;
}
