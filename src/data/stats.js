// "By the numbers": up to three headline figures for a card, set large under its title the
// way a product page sets its specs. Each is { value, unit, label }: the value is what is
// counted up when the card opens (digits, commas and a decimal point only), the unit sits
// beside it, and the label says what the number is. Figures are typical adult values from
// the card's own references and standard physiology texts, rounded the way they are taught.

export const STATS = {
  body: [
    { value: '37', unit: 'trillion', label: 'cells (Bianconi et al., 2013)' },
    { value: '206', unit: 'bones', label: 'in a typical adult' },
    { value: '60', unit: '%', label: 'of an adult man’s weight is water' },
  ],
  'skeletal-system': [
    { value: '206', unit: 'bones', label: 'in an adult; about 270 at birth' },
    { value: '15', unit: '%', label: 'of body weight' },
    { value: '2', unit: 'million', label: 'red blood cells made by the marrow every second' },
  ],
  femur: [
    { value: '45', unit: 'cm', label: 'long: the longest bone in the body' },
    { value: '3', unit: '× body weight', label: 'pressing on the hip with each step when walking' },
    { value: '26', unit: '%', label: 'of body height, so a femur predicts stature' },
  ],
  humerus: [
    { value: '33', unit: 'cm', label: 'long in an adult man' },
    { value: '180', unit: '°', label: 'the arm swings up at the shoulder, the most mobile joint' },
    { value: '3', unit: 'nerves', label: 'run close along it: axillary, radial and ulnar' },
  ],
  radius: [
    { value: '24', unit: 'cm', label: 'long' },
    { value: '160–180', unit: '°', label: 'of turn from palm down to palm up' },
    { value: '1', unit: 'in 6', label: 'of the fractures seen in emergency rooms is at its wrist end' },
  ],
  ulna: [
    { value: '26', unit: 'cm', label: 'long' },
    { value: '150', unit: '°', label: 'the elbow bends on it, a hinge with the humerus' },
    { value: '2', unit: 'joints', label: 'with the radius, at the elbow and at the wrist' },
  ],
  tibia: [
    { value: '38', unit: 'cm', label: 'long: the second-longest bone' },
    { value: '83–94', unit: '%', label: 'of the load on the lower leg passes through it' },
    { value: '2', unit: 'plateaus', label: 'on top, where the femur rests on the menisci' },
  ],
  fibula: [
    { value: '6–17', unit: '%', label: 'of the lower leg’s load is all it carries' },
    { value: '36', unit: 'cm', label: 'long' },
    { value: '1.5', unit: 'cm', label: 'thick, about a finger’s width' },
  ],
  patella: [
    { value: '5', unit: 'cm', label: 'tall: the largest bone that grows inside a tendon' },
    { value: '5', unit: 'mm', label: 'of cartilage on its back, the thickest in the body' },
    { value: '3', unit: '× body weight', label: 'pressing it into the femur as you climb stairs' },
  ],
  sternum: [
    { value: '17', unit: 'cm', label: 'long' },
    { value: '7', unit: 'pairs', label: 'of ribs join it by their cartilage' },
    { value: '5–6', unit: 'cm', label: 'deep is how far CPR pushes it, 100 to 120 times a minute' },
  ],
  mandible: [
    { value: '16', unit: 'teeth', label: 'in the lower jaw of an adult' },
    { value: '600–700', unit: 'N', label: 'of bite at the back teeth in an adult man, roughly' },
    { value: '1', unit: 'year', label: 'old: when its two halves fuse at the chin' },
  ],
  'compact-bone': [
    { value: '80', unit: '%', label: 'of the skeleton’s mass is compact bone' },
    { value: '10', unit: '%', label: 'of the skeleton is rebuilt every year' },
    { value: '0.2', unit: 'mm', label: 'across one osteon, the unit of compact bone' },
  ],
  osteocyte: [
    { value: '42', unit: 'billion', label: 'osteocytes in the skeleton (Buenzli and Sims, 2015)' },
    { value: '90', unit: '%', label: 'of all bone cells' },
    { value: '3.7', unit: 'trillion', label: 'connections between them' },
  ],
  nucleus: [
    { value: '2', unit: 'm', label: 'of DNA packed into a nucleus 6 µm across' },
    { value: '46', unit: 'chromosomes', label: 'in 23 pairs' },
    { value: '6', unit: 'µm', label: 'across in a typical cell' },
  ],
  dna: [
    { value: '3.1', unit: 'billion', label: 'base pairs in one copy of the genome' },
    { value: '20,000', unit: 'genes', label: 'that code for proteins' },
    { value: '2', unit: 'nm', label: 'wide, with a turn every 3.4 nm' },
  ],
  echocardiogram: [
    { value: '1,540', unit: 'm/s', label: 'speed of sound in soft tissue, which turns echo time into depth' },
    { value: '2–4', unit: 'MHz', label: 'sound used to see an adult heart through the chest' },
    { value: '4', unit: 'views', label: 'every trainee learns first' },
  ],
  heart: [
    { value: '100,000', unit: 'beats', label: 'a day' },
    { value: '5', unit: 'L', label: 'of blood pumped a minute at rest' },
    { value: '300', unit: 'g', label: 'in an adult man; about 250 g in a woman' },
  ],
  'left-ventricle': [
    { value: '120', unit: 'mmHg', label: 'peak pressure with each beat' },
    { value: '70', unit: 'mL', label: 'pushed out with each beat at rest' },
    { value: '1', unit: 'cm', label: 'thick wall, three times the right ventricle’s' },
  ],
  blood: [
    { value: '5', unit: 'L', label: 'in an adult' },
    { value: '45', unit: '%', label: 'of it is red cells (the hematocrit)' },
    { value: '1', unit: 'minute', label: 'for blood to go round the whole body at rest' },
  ],
  'red-blood-cell': [
    { value: '25', unit: 'trillion', label: 'in the body, the commonest cell of all' },
    { value: '120', unit: 'days', label: 'each one lasts' },
    { value: '270', unit: 'million', label: 'hemoglobin molecules in each' },
  ],
  hemoglobin: [
    { value: '4', unit: 'O₂', label: 'molecules carried by each hemoglobin' },
    { value: '98', unit: '%', label: 'of the oxygen in blood rides on it' },
    { value: '64,500', unit: 'Da', label: 'four chains, each with one heme' },
  ],
  heme: [
    { value: '1', unit: 'iron atom', label: 'at its center binds one O₂' },
    { value: '4', unit: 'hemes', label: 'in each hemoglobin' },
    { value: '2.5', unit: 'g', label: 'of iron in an adult’s hemoglobin, about two thirds of the body’s iron' },
  ],
  biceps: [
    { value: '2', unit: 'heads', label: 'that join into one tendon at the elbow' },
    { value: '600', unit: 'muscles', label: 'skeletal muscles in the body, give or take' },
    { value: '40', unit: '%', label: 'of body weight is skeletal muscle' },
  ],
  deltoid: [
    { value: '3', unit: 'parts', label: 'front, middle and back, each swinging the arm a different way' },
    { value: '15', unit: '°', label: 'of lift the supraspinatus gives before the middle part takes over' },
  ],
  'pectoralis-major': [
    { value: '3', unit: 'parts', label: 'from the collarbone, the breastbone and ribs, and the belly wall' },
    { value: '20', unit: 'cm', label: 'across the chest' },
  ],
  'rectus-abdominis': [
    { value: '3–4', unit: 'tendon bands', label: 'across each strap, making the six-pack' },
    { value: '30–40', unit: 'cm', label: 'from the ribs to the pubic bone' },
  ],
  'external-oblique': [
    { value: '3', unit: 'layers', label: 'of flat muscle in the belly wall, their fibers crossing like plywood' },
  ],
  sartorius: [
    { value: '50', unit: 'cm', label: 'long: the longest muscle in the body' },
  ],
  'calf-muscles': [
    { value: '2', unit: 'muscles', label: 'share one tendon, the Achilles, the strongest in the body' },
  ],
  triceps: [
    { value: '3', unit: 'heads', label: 'long, lateral and medial, joining at the point of the elbow' },
  ],
  sarcomere: [
    { value: '2.5', unit: 'µm', label: 'long at rest' },
    { value: '30', unit: '%', label: 'shorter when fully contracted' },
    { value: '10,000', unit: 'sarcomeres', label: 'end to end in a 2.5 cm length of fiber' },
  ],
  'reflex-arc': [
    { value: '18', unit: 'ms', label: 'from the tap to the thigh muscle twitching' },
    { value: '1', unit: 'synapse', label: 'in the loop, in the spinal cord: no brain needed' },
    { value: '1', unit: 'm', label: 'of nerve there and back' },
  ],
  'spinal-cord-section': [
    { value: '45', unit: 'cm', label: 'long in an adult man' },
    { value: '31', unit: 'pairs', label: 'of spinal nerves leave it' },
    { value: '1', unit: 'cm', label: 'across, about the width of a finger' },
  ],
  'body-elements': [
    { value: '65', unit: '%', label: 'of body mass is oxygen, mostly in water' },
    { value: '96', unit: '%', label: 'is just four elements: oxygen, carbon, hydrogen and nitrogen' },
    { value: '6.5', unit: '× 10²⁷ atoms', label: 'in a 70 kg adult' },
  ],
  'lymph-node': [
    { value: '600', unit: 'nodes', label: 'in the body, about 450 to 800' },
    { value: '2', unit: 'cm', label: 'at most when quiet; they swell when fighting an infection' },
    { value: '3', unit: 'L', label: 'of lymph returned to the blood each day' },
  ],
  antibody: [
    { value: '4', unit: 'chains', label: 'two heavy and two light, in a Y' },
    { value: '2', unit: 'tips', label: 'that each grip the same target' },
    { value: '150,000', unit: 'Da', label: 'for the commonest kind, IgG' },
  ],
  brain: [
    { value: '86', unit: 'billion', label: 'neurons (Azevedo et al., 2009)' },
    { value: '2', unit: '%', label: 'of body weight' },
    { value: '20', unit: '%', label: 'of the body’s energy at rest' },
  ],
  'cortex-layers': [
    { value: '6', unit: 'layers', label: 'in most of the cortex' },
    { value: '16', unit: 'billion', label: 'neurons in the cerebral cortex' },
    { value: '2.5', unit: 'mm', label: 'thick on average' },
  ],
  neuron: [
    { value: '86', unit: 'billion', label: 'in the brain' },
    { value: '120', unit: 'm/s', label: 'fastest signals, along thick insulated axons' },
    { value: '7,000', unit: 'synapses', label: 'on a typical cortical neuron' },
  ],
  synapse: [
    { value: '20', unit: 'nm', label: 'gap between the two cells' },
    { value: '0.5', unit: 'ms', label: 'to cross it' },
    { value: '100', unit: 'trillion', label: 'synapses in the brain, roughly' },
  ],
  lungs: [
    { value: '480', unit: 'million', label: 'alveoli (Ochs et al., 2004)' },
    { value: '70', unit: 'm²', label: 'of surface for gas exchange, about 35 times the skin’s' },
    { value: '12–20', unit: 'breaths', label: 'a minute at rest' },
  ],
  alveolus: [
    { value: '480', unit: 'million', label: 'in both lungs' },
    { value: '0.2', unit: 'mm', label: 'across' },
    { value: '0.25', unit: 's', label: 'for blood passing it to pick up its oxygen' },
  ],
  'air-blood-barrier': [
    { value: '0.6', unit: 'µm', label: 'thick on average' },
    { value: '0.75', unit: 's', label: 'a red cell spends in a lung capillary at rest' },
    { value: '250', unit: 'mL', label: 'of oxygen taken up a minute at rest' },
  ],
  'digestive-system': [
    { value: '7.5', unit: 'm', label: 'of tube from mouth to anus in a living adult' },
    { value: '24–72', unit: 'hours', label: 'for a meal to pass through' },
    { value: '7', unit: 'L', label: 'of digestive juices made each day, nearly all taken back' },
  ],
  'small-intestine': [
    { value: '3', unit: 'm', label: 'long in life' },
    { value: '32', unit: 'm²', label: 'inner surface (Helander and Fändriks, 2014)' },
    { value: '90', unit: '%', label: 'of nutrients are absorbed here' },
  ],
  'intestinal-villus': [
    { value: '1', unit: 'mm', label: 'tall at most' },
    { value: '3–5', unit: 'days', label: 'before its lining is replaced' },
    { value: '30', unit: 'per mm²', label: 'like a velvet pile' },
  ],
  enterocyte: [
    { value: '3–5', unit: 'days', label: 'from birth in a crypt to shedding at the villus tip' },
    { value: '1,000s', unit: 'microvilli', label: 'on each cell, the brush border' },
    { value: '1', unit: 'µm', label: 'tall, each microvillus' },
  ],
  'urinary-system': [
    { value: '180', unit: 'L', label: 'of fluid filtered from the blood each day' },
    { value: '1.5', unit: 'L', label: 'of urine made from it' },
    { value: '500', unit: 'mL', label: 'that the bladder comfortably holds' },
  ],
  kidney: [
    { value: '1', unit: 'million', label: 'nephrons in each kidney' },
    { value: '20', unit: '%', label: 'of the heart’s output flows through the two kidneys' },
    { value: '150', unit: 'g', label: 'each, about the size of a fist' },
  ],
  nephron: [
    { value: '1', unit: 'million', label: 'in each kidney' },
    { value: '99', unit: '%', label: 'of the filtered fluid is taken back' },
    { value: '125', unit: 'mL', label: 'filtered a minute by all of them together' },
  ],
  'thyroid-gland': [
    { value: '25', unit: 'g', label: 'in an adult' },
    { value: '100', unit: 'µg', label: 'of thyroxine (T4) made a day' },
    { value: '150', unit: 'µg', label: 'of iodine an adult needs a day to make it' },
  ],
  skin: [
    { value: '2', unit: 'm²', label: 'covering an adult' },
    { value: '16', unit: '%', label: 'of body weight: the largest organ' },
    { value: '2–4', unit: 'million', label: 'sweat glands' },
  ],
  epidermis: [
    { value: '0.1', unit: 'mm', label: 'thick over most of the body' },
    { value: '4–6', unit: 'weeks', label: 'for a cell to rise from the base and flake off' },
    { value: '1.5', unit: 'mm', label: 'thick on the palms and soles' },
  ],
  eye: [
    { value: '24', unit: 'mm', label: 'across' },
    { value: '120', unit: 'million', label: 'rods, for dim light' },
    { value: '6', unit: 'million', label: 'cones, for color and detail' },
  ],
  retina: [
    { value: '0.25', unit: 'mm', label: 'thick, ten layers deep' },
    { value: '1.2', unit: 'million', label: 'nerve fibers leave it in the optic nerve' },
    { value: '1.5', unit: 'mm', label: 'across the fovea, where vision is sharpest' },
  ],
  ear: [
    { value: '20–20,000', unit: 'Hz', label: 'the range a young ear can hear' },
    { value: '3', unit: 'ossicles', label: 'the smallest bones in the body' },
    { value: '3,500', unit: 'inner hair cells', label: 'in each cochlea' },
  ],
  'inner-hair-cell': [
    { value: '3,500', unit: 'cells', label: 'in each cochlea' },
    { value: '95', unit: '%', label: 'of the hearing nerve’s fibers come from them' },
    { value: '1', unit: 'row', label: 'of inner hair cells, beside three rows of outer ones' },
  ],
  pancreas: [
    { value: '15', unit: 'cm', label: 'long' },
    { value: '1', unit: 'million', label: 'islets scattered through it' },
    { value: '1.5', unit: 'L', label: 'of digestive juice made a day' },
  ],
  islet: [
    { value: '1', unit: 'million', label: 'in the pancreas' },
    { value: '2', unit: '%', label: 'of the pancreas by mass' },
    { value: '0.1', unit: 'mm', label: 'across, a typical islet' },
  ],
  'beta-cell': [
    { value: '60', unit: '%', label: 'of the cells in a human islet' },
    { value: '1', unit: 'billion', label: 'beta cells in a healthy adult' },
    { value: '5', unit: 'mmol/L', label: 'blood sugar they hold steady between meals' },
  ],
  liver: [
    { value: '1.5', unit: 'kg', label: 'the largest internal organ' },
    { value: '25', unit: '%', label: 'of the heart’s output flows through it' },
    { value: '0.5–1', unit: 'L', label: 'of bile made a day' },
  ],
  hepatocyte: [
    { value: '80', unit: '%', label: 'of the liver’s volume' },
    { value: '200', unit: 'billion', label: 'of them in an adult liver, roughly' },
    { value: '200–400', unit: 'days', label: 'that each one lives, far longer than most gut cells' },
  ],
  'nasal-cavity': [
    { value: '11,000', unit: 'L', label: 'of air through it a day' },
    { value: '2', unit: 'sides', label: 'split by the septum' },
    { value: '37', unit: '°C', label: 'that air is warmed to on the way in' },
  ],
  'olfactory-epithelium': [
    { value: '5', unit: 'cm²', label: 'in the roof of the nose' },
    { value: '400', unit: 'kinds', label: 'of odor receptor' },
    { value: '30–60', unit: 'days', label: 'for a smell neuron to be replaced' },
  ],
  'subclavian-vessels': [
    { value: '1', unit: 'brachiocephalic artery', label: 'on the right only; the left vessels branch straight off the aortic arch' },
    { value: '2', unit: 'brachiocephalic veins', label: 'join to form the superior vena cava' },
    { value: '1', unit: 'cm', label: 'across, arching over the first rib' },
  ],
  'iliac-vessels': [
    { value: '2', unit: 'common iliac arteries', label: 'from the aorta’s fork at the fourth lumbar vertebra, level with the navel' },
    { value: '2', unit: 'branches each', label: 'external for the leg, internal for the pelvis' },
    { value: '1', unit: 'cm', label: 'across the common iliac artery' },
  ],
  'gut-vessels': [
    { value: '3', unit: 'unpaired arteries', label: 'leave the front of the aorta for the gut' },
    { value: '25', unit: '%', label: 'of the heart’s output at rest; more after a meal' },
    { value: '75', unit: '%', label: 'of the liver’s blood arrives through the portal vein' },
  ],
  'limb-vessels': [
    { value: '6', unit: 'pulse points', label: 'on each side: wrist, elbow, groin, behind the knee, ankle and top of the foot' },
    { value: '120', unit: 'mmHg', label: 'a typical top (systolic) blood pressure, taken over the brachial artery' },
    { value: '8', unit: 'mm', label: 'across the femoral artery at the groin' },
  ],
  'facial-muscles': [
    { value: '20', unit: 'muscles', label: 'on each side of the face, about' },
    { value: '1', unit: 'nerve', label: 'works them all: the facial nerve' },
  ],
  'chewing-muscles': [
    { value: '4', unit: 'muscles', label: 'on each side move the jaw' },
    { value: '700', unit: 'N', label: 'the most the molars can bite with, about' },
  ],
  'hyoid-muscles': [
    { value: '8', unit: 'muscles', label: 'on each side hang the hyoid: four above it, four below' },
    { value: '0', unit: 'bones', label: 'touch the hyoid; it hangs in muscle' },
  ],
  'deep-neck-muscles': [
    { value: '3', unit: 'scalenes', label: 'on each side, down to the first two ribs' },
    { value: '5', unit: 'kg', label: 'of head balanced on the neck, about' },
  ],
  'back-muscles': [
    { value: '3', unit: 'columns', label: 'in the erector spinae: iliocostalis, longissimus and spinalis' },
    { value: '60', unit: 'cm', label: 'long, from the pelvis to the skull, about' },
  ],
  'intercostal-muscles': [
    { value: '11', unit: 'gaps', label: 'between the ribs on each side' },
    { value: '3', unit: 'layers', label: 'of muscle in each gap' },
  ],
  'abdominal-wall': [
    { value: '3', unit: 'layers', label: 'of muscle, their fibers at three angles like plywood' },
  ],
  'rotator-cuff': [
    { value: '4', unit: 'muscles', label: 'around the ball of the shoulder' },
    { value: '15', unit: '°', label: 'the first of lifting the arm out, started by supraspinatus, about' },
  ],
  'shoulder-blade-muscles': [
    { value: '17', unit: 'muscles', label: 'attach to each shoulder blade' },
    { value: '2', unit: 'to 1', label: 'arm to shoulder-blade turn as you raise the arm' },
  ],
  'forearm-flexors': [
    { value: '9', unit: 'tendons', label: 'share the carpal tunnel with the median nerve' },
    { value: '14', unit: '%', label: 'of people have no palmaris longus, about' },
  ],
  'forearm-extensors': [
    { value: '3', unit: 'thumb tendons', label: 'outline the anatomical snuffbox' },
  ],
  'hand-muscles': [
    { value: '20', unit: 'muscles', label: 'start and end in each hand, about' },
  ],
  'hip-muscles': [
    { value: '6', unit: 'small rotators', label: 'across the back of each hip joint' },
  ],
  'hip-adductors': [
    { value: '5', unit: 'muscles', label: 'in the inner thigh' },
  ],
  'psoas': [
    { value: '30', unit: 'cm', label: 'long, about' },
    { value: '6', unit: 'vertebrae', label: 'it starts from: the last thoracic and all five lumbar' },
  ],
  'deep-calf-muscles': [
    { value: '10', unit: '%', label: 'of people have no plantaris, about' },
  ],
  'fibularis-muscles': [
    { value: '2', unit: 'muscles', label: 'with tendons behind the outer ankle' },
  ],
  'foot-muscles': [
    { value: '20', unit: 'muscles', label: 'start and end in each foot, about' },
    { value: '4', unit: 'layers', label: 'of muscle on the sole' },
  ],
};

/** The headline figures for a card, or an empty list. */
export function statsFor(cardId) {
  return STATS[cardId] ?? [];
}

/** The number to count up to, or null when the value isn't a single number (a range, "1,000s"). */
export function countTo(value) {
  return /^\d[\d,]*(\.\d+)?$/.test(value) ? Number(value.replace(/,/g, '')) : null;
}
