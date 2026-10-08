// "Check yourself" questions, one set per built dive or module.
// `answer` is the index of the correct choice; `explain` is shown after
// answering, right or wrong. Every answer is covered by a card in the dive.

export const QUIZZES = {
  skeletal: [
    {
      q: 'What sits inside each small pocket (lacuna) in compact bone?',
      choices: ['A drop of marrow', 'A living bone cell (osteocyte)', 'A mineral crystal', 'A blood vessel'],
      answer: 1,
      explain: 'Each lacuna holds one osteocyte, which reaches its neighbors through tiny channels called canaliculi.',
    },
    {
      q: 'Why is every bone cell kept within about 0.1 mm of a blood vessel?',
      choices: ['Bone is too hard for vessels to grow through', 'Diffusion time grows with distance squared, so oxygen reaches far cells too slowly', 'Bone cells have no mitochondria', 'Vessels make the bone stronger'],
      answer: 1,
      explain: 't ≈ x² / 2D: oxygen crosses 0.1 mm in about 2 seconds, but 1 mm takes about 4 minutes.',
    },
    {
      q: 'The DNA in one human cell, stretched out, would be about how long?',
      choices: ['2 micrometers', '2 millimeters', '2 meters', '2 kilometers'],
      answer: 2,
      explain: 'About 6.4 billion base pairs × 0.34 nm per base pair ≈ 2.2 m, packed into a nucleus a few micrometers wide.',
    },
    {
      q: 'Which bases pair together in DNA?',
      choices: ['A with G, and T with C', 'A with T, and G with C', 'A with C, and G with T', 'Any base with any other'],
      answer: 1,
      explain: 'A pairs with T (two hydrogen bonds) and G pairs with C (three), so each strand is a template for the other.',
    },
  ],
  circulatory: [
    {
      q: 'Which chamber has the thickest wall?',
      choices: ['Right atrium', 'Left atrium', 'Right ventricle', 'Left ventricle'],
      answer: 3,
      explain: 'The left ventricle pumps blood to the whole body, at about five times the pressure of the right ventricle.',
    },
    {
      q: 'What does a mature red blood cell lack?',
      choices: ['A cell membrane', 'Hemoglobin', 'A nucleus', 'Water'],
      answer: 2,
      explain: 'Losing the nucleus makes room for about 270 million hemoglobin molecules and lets the cell fold through narrow capillaries.',
    },
    {
      q: 'How many oxygen molecules can one hemoglobin carry?',
      choices: ['One', 'Two', 'Four', 'Hundreds'],
      answer: 2,
      explain: 'Four chains, each with one heme group, and each heme holds one O₂.',
    },
    {
      q: 'Why is carbon monoxide dangerous?',
      choices: ['It dissolves red blood cells', 'It binds heme iron about 200 times more tightly than oxygen', 'It blocks the heart valves', 'It turns iron into rust'],
      answer: 1,
      explain: 'It occupies the same iron that oxygen needs, so less oxygen can be carried.',
    },
  ],
  muscular: [
    {
      q: 'When a sarcomere shortens, which band stays the same length?',
      choices: ['The A band', 'The I band', 'The H zone', 'All of them shrink'],
      answer: 0,
      explain: 'The A band is the length of the thick filaments (1.6 µm). Filaments slide past each other instead of shrinking.',
    },
    {
      q: 'Why does one muscle fiber have many nuclei?',
      choices: ['It is several cells fused together during development', 'It is dividing', 'Muscle cells copy their DNA for storage', 'The nuclei are from nearby blood cells'],
      answer: 0,
      explain: 'Precursor cells fuse into one long fiber, and each nucleus looks after the stretch of fiber around it.',
    },
    {
      q: 'What does ATP let a myosin head do?',
      choices: ['Grab actin', 'Let go of actin and re-cock', 'Make actin longer', 'Carry oxygen'],
      answer: 1,
      explain: 'ATP binding releases the head; splitting ATP re-cocks it. Without ATP, heads stay stuck (rigor mortis).',
    },
    {
      q: 'In a resting muscle, what covers the spots on actin where myosin would grab?',
      choices: ['Titin', 'Tropomyosin', 'Collagen', 'Hemoglobin'],
      answer: 1,
      explain: 'Calcium binds troponin, which moves tropomyosin aside and lets contraction start.',
    },
  ],
  immune: [
    {
      q: 'Where in a lymph node do B cells compete to make better antibodies?',
      choices: ['The capsule', 'The germinal center of a follicle', 'The efferent vessel', 'The paracortex'],
      answer: 1,
      explain: 'In germinal centers, B cells mutate their antibody genes and only the best binders are selected (affinity maturation).',
    },
    {
      q: 'Why is a plasma cell full of rough endoplasmic reticulum?',
      choices: ['To store fat', 'To build and fold large amounts of antibody protein', 'To divide faster', 'To carry oxygen'],
      answer: 1,
      explain: 'Ribosomes on the rough ER make the antibody chains, which fold and are joined inside its sheets.',
    },
    {
      q: 'Which part of an antibody grips the target?',
      choices: ['The Fc stem', 'The hinge', 'The loops at the tips of the arms', 'The sugar chain'],
      answer: 2,
      explain: 'Six loops (CDRs) at the tip of each arm form the antigen-binding site.',
    },
    {
      q: 'How many polypeptide chains make up one IgG antibody?',
      choices: ['One', 'Two', 'Four', 'Twelve'],
      answer: 2,
      explain: 'Two heavy chains and two light chains. Twelve is the number of domains, not chains.',
    },
  ],
  inflammation: [
    {
      q: 'Which cells usually arrive first at a bacterial infection?',
      choices: ['Plasma cells', 'Neutrophils', 'Red blood cells', 'Osteocytes'],
      answer: 1,
      explain: 'Neutrophils leave the blood within hours, following chemical signals to the bacteria.',
    },
    {
      q: 'What causes the swelling around a wound?',
      choices: ['Bacteria taking up space', 'Fluid leaking from widened, leaky small vessels', 'Bone growth', 'Extra fat'],
      answer: 1,
      explain: 'Histamine and other signals make venules leaky, so plasma moves into the tissue.',
    },
    {
      q: 'What does a mast cell release when triggered?',
      choices: ['Antibodies', 'Histamine and other signals from its granules', 'Hemoglobin', 'ATP'],
      answer: 1,
      explain: 'Its granules empty all at once, which starts the alarm within seconds.',
    },
    {
      q: 'How does inflammation end?',
      choices: ['It only fades when the signals run out', 'An active resolution phase with its own signals, led partly by macrophages', 'The vessel closes permanently', 'It never ends'],
      answer: 1,
      explain: 'Resolution is active: macrophages clear spent neutrophils and release pro-resolving mediators.',
    },
  ],
  nervous: [
    {
      q: 'Where does a neuron’s spike (action potential) usually start?',
      choices: ['At the tips of the dendrites', 'At the axon hillock, where the axon leaves the cell body', 'Inside the nucleus', 'At the synaptic cleft'],
      answer: 1,
      explain: 'The axon hillock has the densest sodium channels, so it is where inputs either trigger a spike or do not.',
    },
    {
      q: 'Why do myelinated axons conduct faster?',
      choices: ['Myelin carries the current itself', 'The spike jumps from node to node instead of creeping along every bit of membrane', 'Myelin makes the axon longer', 'Myelin stores neurotransmitter'],
      answer: 1,
      explain: 'Myelin insulates the axon, so the spike is only regenerated at the nodes of Ranvier (saltatory conduction).',
    },
    {
      q: 'Using v ≈ 6 m/s per µm, about how long does a signal take to travel 1 m along a 10 µm myelinated fiber?',
      choices: ['About 1.7 ms', 'About 17 ms', 'About 170 ms', 'About 1.7 s'],
      answer: 1,
      explain: 'v ≈ 6 × 10 = 60 m/s, so t = 1 m ÷ 60 m/s ≈ 0.017 s, or 17 ms.',
    },
    {
      q: 'What directly triggers synaptic vesicles to release glutamate?',
      choices: ['Sodium leaving the terminal', 'Calcium rushing into the terminal', 'Glutamate binding receptors', 'ATP running out'],
      answer: 1,
      explain: 'The spike opens calcium channels at the active zone; calcium binding the vesicle’s sensor proteins triggers fusion.',
    },
  ],
  respiratory: [
    {
      q: 'Which muscle does most of the work of a quiet breath in?',
      choices: ['The biceps', 'The diaphragm', 'The heart', 'Muscles in the trachea'],
      answer: 1,
      explain: 'The diaphragm contracts and flattens, pulling the lungs down so air flows in.',
    },
    {
      q: 'About how thick is the barrier between air and blood in the alveoli?',
      choices: ['About 0.6 µm', 'About 0.6 mm', 'About 6 mm', 'About 6 cm'],
      answer: 0,
      explain: 'On average about 0.6 µm, and as little as 0.2 µm, so oxygen crosses in well under a millisecond.',
    },
    {
      q: 'A red blood cell spends about 0.75 s in a lung capillary. How long does it take to load up with oxygen at rest?',
      choices: ['The whole 0.75 s, barely', 'About a third of that time', 'Several seconds', 'It never fully loads'],
      answer: 1,
      explain: 'Blood matches the air’s oxygen pressure about a third of the way along, which leaves a margin for exercise.',
    },
    {
      q: 'Air is about 78% nitrogen. What happens to that nitrogen when you breathe?',
      choices: ['Your cells burn it', 'It is turned into protein', 'Almost all of it goes in and straight back out', 'It turns into carbon dioxide'],
      answer: 2,
      explain: 'N₂’s triple bond makes it very unreactive; your body does not use it.',
    },
  ],
  'immune-response': [
    {
      q: 'Which of these is smallest?',
      choices: ['A red blood cell', 'A bacterium', 'An influenza virus', 'A lymphocyte'],
      answer: 2,
      explain: 'An influenza virus is about 0.1 µm across, roughly 80 times narrower than a red blood cell and 20 times smaller than a bacterium.',
    },
    {
      q: 'Why is the response to a germ faster the second time?',
      choices: ['The germ is weaker the second time', 'Memory B cells are already many and already fit the germ well', 'Red blood cells remember the germ', 'The body runs a higher fever'],
      answer: 1,
      explain: 'Memory B cells left from the first response turn into antibody-making plasma cells within days instead of a week or more.',
    },
    {
      q: 'Which cell makes antibodies?',
      choices: ['Neutrophil', 'Plasma cell', 'Red blood cell', 'Platelet'],
      answer: 1,
      explain: 'Plasma cells develop from activated B cells and spend their short lives pouring out one antibody.',
    },
    {
      q: 'How does a vaccine protect you?',
      choices: ['It kills germs directly', 'It gives you a safe first response, so a real infection meets a fast second response', 'It replaces your white blood cells', 'It only works while it stays in your blood'],
      answer: 1,
      explain: 'A vaccine trains the slow first response without the illness, leaving memory cells ready for the real germ.',
    },
  ],
  chemistry: [
    {
      q: 'By mass, which element makes up most of your body?',
      choices: ['Carbon', 'Oxygen', 'Hydrogen', 'Nitrogen'],
      answer: 1,
      explain: 'About 65% of your mass is oxygen, mostly in water.',
    },
    {
      q: 'Counting atoms instead of mass, which element is most common in your body?',
      choices: ['Oxygen', 'Carbon', 'Hydrogen', 'Calcium'],
      answer: 2,
      explain: 'Hydrogen is so light that 9.5% of your mass is about 61% of your atoms.',
    },
    {
      q: 'How does an enzyme speed up a reaction?',
      choices: ['It adds energy to the molecules', 'It lowers the energy barrier the reaction has to cross', 'It changes what the reaction makes', 'It heats the cell'],
      answer: 1,
      explain: 'Lowering the barrier by about 41.6 kJ/mol makes carbonic anhydrase’s reaction about ten million times faster. The starting materials and products stay the same.',
    },
    {
      q: 'If you breathe too slowly and carbon dioxide builds up in your blood, what happens to its pH?',
      choices: ['It rises', 'It falls (more acidic)', 'It stays exactly the same', 'It drops to zero'],
      answer: 1,
      explain: 'More CO₂ pushes CO₂ + H₂O ⇌ H⁺ + HCO₃⁻ to the right, making more H⁺. Doubling the CO₂ drops pH by about 0.3.',
    },
  ],
  't-cells': [
    {
      q: 'What does a T cell actually recognize?',
      choices: ['A whole virus floating in the blood', 'A short peptide held by an MHC molecule on another cell', 'The color of a cell', 'Antibodies'],
      answer: 1,
      explain: 'T cells only see short pieces of proteins, displayed by MHC molecules on the surface of other cells.',
    },
    {
      q: 'Which cells do killer (CD8) T cells destroy?',
      choices: ['Healthy red blood cells', 'Your own cells that show foreign peptides on MHC class I, such as virus-infected cells', 'Free-floating bacteria only', 'Helper T cells'],
      answer: 1,
      explain: 'Almost every cell shows samples of its proteins on MHC class I; a viral peptide marks it for destruction.',
    },
    {
      q: 'How does a killer T cell make its target die?',
      choices: ['It swallows the whole cell', 'Perforin opens pores and granzymes switch on the cell’s own self-destruct program (apoptosis)', 'It starves the cell of oxygen', 'It releases antibodies'],
      answer: 1,
      explain: 'Apoptosis keeps the cell’s contents, and any virus, wrapped up, so macrophages can clear the pieces quietly.',
    },
    {
      q: 'A matching T cell doubles 10 times. About how many cells does it make?',
      choices: ['20', '100', 'About 1,000', 'About a million'],
      answer: 2,
      explain: '2¹⁰ = 1,024. Twenty doublings would make about a million.',
    },
  ],
  digestive: [
    {
      q: 'Where are most nutrients absorbed?',
      choices: ['The stomach', 'The small intestine', 'The large intestine', 'The esophagus'],
      answer: 1,
      explain: 'The small intestine finishes digestion and absorbs nearly all nutrients; the large intestine mostly absorbs water and salts.',
    },
    {
      q: 'What do circular folds, villi and microvilli have in common?',
      choices: ['They push food along', 'They all add surface area for absorption', 'They make stomach acid', 'They store fat'],
      answer: 1,
      explain: 'Folds within folds within folds give the small intestine an absorbing surface of about 200 m².',
    },
    {
      q: 'How does glucose get into an absorbing cell from the gut?',
      choices: ['It dissolves straight through the membrane', 'A carrier brings it in together with sodium ions', 'White blood cells carry it', 'It enters through the tight junctions'],
      answer: 1,
      explain: 'SGLT1 couples glucose to sodium flowing into the cell. The sodium–potassium pump keeps sodium low inside, so the carrier keeps working.',
    },
    {
      q: 'Absorbed glucose enters the blood. Which organ does that blood reach first?',
      choices: ['The brain', 'The liver', 'The kidneys', 'The heart muscle'],
      answer: 1,
      explain: 'Blood from the intestine drains into the hepatic portal vein, so the liver gets first pick of absorbed sugar.',
    },
  ],
  urinary: [
    {
      q: 'About how much fluid do the kidneys filter out of the blood each day?',
      choices: ['About 2 liters', 'About 20 liters', 'About 180 liters', 'About 1,000 liters'],
      answer: 2,
      explain: 'About 180 liters a day in men and 150 in women. About 99 percent is taken back, leaving 1 to 2 liters of urine.',
    },
    {
      q: 'Which part of the nephron reclaims the most water, salt, glucose and amino acids?',
      choices: ['The proximal convoluted tubule', 'The collecting duct', 'Bowman’s capsule', 'The renal pelvis'],
      answer: 0,
      explain: 'The proximal tubule takes back about two thirds of the water, sodium and potassium, and almost all the glucose and amino acids.',
    },
    {
      q: 'Why does albumin normally stay in the blood?',
      choices: ['It is too heavy to move', 'The filter holds back medium and large proteins', 'The liver keeps it', 'The tubule always reabsorbs all of it'],
      answer: 1,
      explain: 'The basement membrane stops medium-to-large proteins. Water, salts, glucose and urea, all under a nanometer, pass easily.',
    },
    {
      q: 'Where does urea come from?',
      choices: ['Burning fat', 'Nitrogen from broken-down amino acids, made safe by the liver', 'Old red blood cells', 'Sugar the kidneys could not reabsorb'],
      answer: 1,
      explain: 'Breaking down amino acids releases ammonia, which is toxic. The liver turns it into urea, which the kidneys filter out.',
    },
  ],
  endocrine: [
    {
      q: 'Where is the thyroid gland?',
      choices: ['Behind the stomach', 'In front of the windpipe, just below the larynx', 'On top of each kidney', 'At the base of the brain'],
      answer: 1,
      explain: 'Its two lobes hug the windpipe below the Adam’s apple, joined by an isthmus across the 2nd and 3rd tracheal rings.',
    },
    {
      q: 'Where is thyroid hormone stored before it is released?',
      choices: ['In the colloid, still part of thyroglobulin', 'In the pituitary', 'In fat cells', 'It is never stored'],
      answer: 0,
      explain: 'Hormone is built on thyroglobulin in the colloid inside each follicle, and freed only when the cells take colloid back in.',
    },
    {
      q: 'What does T4 have that T3 does not?',
      choices: ['A sugar ring', 'One more iodine atom', 'A phosphate group', 'A metal ion'],
      answer: 1,
      explain: 'T4 carries four iodines, T3 three. Many cells remove one iodine from T4 to make T3, the more potent form.',
    },
    {
      q: 'Why can a lack of iodine in the diet make the thyroid swell (a goiter)?',
      choices: ['Iodine is a toxin', 'Without iodine little hormone is made, so TSH keeps stimulating the gland', 'The gland stores excess salt', 'Iodine shrinks cells'],
      answer: 1,
      explain: 'Low T3 and T4 keep TSH high; the overstimulated gland accumulates colloid and enlarges.',
    },
  ],
  skin: [
    {
      q: 'Which layer of the skin has no blood vessels?',
      choices: ['The epidermis', 'The papillary dermis', 'The reticular dermis', 'The hypodermis'],
      answer: 0,
      explain: 'The epidermis is fed by capillary loops in the dermal papillae just below it.',
    },
    {
      q: 'Where are new epidermal cells made?',
      choices: ['In the stratum corneum', 'In the stratum basale', 'In the hypodermis', 'In sweat glands'],
      answer: 1,
      explain: 'Basal cells divide; their daughters move up, fill with keratin, flatten and die. The whole stratum corneum is replaced about every 4 weeks.',
    },
    {
      q: 'What does melanin do?',
      choices: ['Makes sweat', 'Absorbs UV light before it can damage DNA', 'Stores fat', 'Senses touch'],
      answer: 1,
      explain: 'Melanocytes pass melanin to keratinocytes, where it gathers over the nucleus and shields the DNA.',
    },
    {
      q: 'What do you need for your skin to make vitamin D3?',
      choices: ['Ultraviolet light', 'Cold temperatures', 'Sweating', 'Iodine'],
      answer: 0,
      explain: 'UV light converts a cholesterol derivative in skin cell membranes into vitamin D3. The liver and kidneys then activate it.',
    },
  ],
  eye: [
    {
      q: 'What does most of the eye’s focusing?',
      choices: ['The cornea', 'The iris', 'The retina', 'The optic nerve'],
      answer: 0,
      explain: 'Light bends most where it passes from air into the cornea; the lens fine-tunes the focus.',
    },
    {
      q: 'Why do you have a blind spot?',
      choices: ['The lens is cloudy there', 'The optic disc, where the optic nerve leaves, has no photoreceptors', 'The iris blocks that part', 'Cones are missing in the fovea'],
      answer: 1,
      explain: 'Ganglion cell axons gather at the optic disc to leave the eye, so there is no room for rods or cones there.',
    },
    {
      q: 'What happens to retinal when it absorbs a photon?',
      choices: ['It splits in two', 'It flips from 11-cis to all-trans', 'It leaves the eye', 'It turns into vitamin D'],
      answer: 1,
      explain: 'The bent 11-cis form straightens to all-trans, changing rhodopsin’s shape and starting the signal.',
    },
    {
      q: 'In light, what does a rod do?',
      choices: ['Fires more action potentials', 'Hyperpolarizes and releases less neurotransmitter', 'Opens more sodium channels', 'Makes more cGMP'],
      answer: 1,
      explain: 'Light lowers cGMP, closing sodium channels; the rod hyperpolarizes and releases less neurotransmitter.',
    },
  ],
  ear: [
    {
      q: 'What do the three ossicles of the middle ear do?',
      choices: ['Sense balance', 'Pass on and amplify the eardrum’s vibration', 'Make earwax', 'Drain fluid to the throat'],
      answer: 1,
      explain: 'The malleus, incus and stapes concentrate the eardrum’s vibration onto the small oval window of the inner ear.',
    },
    {
      q: 'Where along the cochlea are high-pitched sounds sensed?',
      choices: ['At the base, near the oval window', 'At the apex (tip)', 'In the semicircular canals', 'Evenly along its length'],
      answer: 0,
      explain: 'High frequencies move the narrow, stiff base of the basilar membrane; low frequencies travel to the apex.',
    },
    {
      q: 'What bends a hair cell’s stereocilia?',
      choices: ['Light', 'The basilar membrane moving under the still tectorial membrane', 'Blood pressure', 'Air in the middle ear'],
      answer: 1,
      explain: 'The organ of Corti rocks with the basilar membrane while the tectorial membrane above stays put, so the stereocilia between them bend.',
    },
    {
      q: 'Which cells are the main receptors for hearing?',
      choices: ['Outer hair cells', 'Inner hair cells, in a single row', 'Spiral ganglion cells', 'Pillar cells'],
      answer: 1,
      explain: 'About 3,500 inner hair cells in one row carry most of what you hear; about 12,000 outer hair cells fine-tune the response.',
    },
  ],
  reflex: [
    {
      q: 'Why does the knee jerk not need the brain?',
      choices: ['The brain is asleep during it', 'The sensory neuron connects to the motor neuron right in the spinal cord', 'The kneecap has its own nerve cells', 'The muscle contracts without any nerve'],
      answer: 1,
      explain: 'The whole loop runs through the spinal cord at L2 to L4. The brain is told afterwards, through the white matter.',
    },
    {
      q: 'About how long does it take from the tap to the start of the kick?',
      choices: ['About 2 ms', 'About 18 ms', 'About 200 ms', 'About 2 seconds'],
      answer: 1,
      explain: 'About 18 ms, mostly spent traveling a meter of nerve. A voluntary reaction takes ten times longer.',
    },
    {
      q: 'Which molecule carries the command from the motor neuron to the muscle fiber?',
      choices: ['Glucose', 'Acetylcholine', 'Hemoglobin', 'Glutamate'],
      answer: 1,
      explain: 'At the neuromuscular junction, acetylcholine crosses the gap and opens receptors on the muscle fiber. An enzyme then cuts it up so the signal stays brief.',
    },
    {
      q: 'Why do the hamstrings relax during the kick?',
      choices: ['They are too tired', 'An inhibitory interneuron in the cord quiets their motor neurons', 'The brain tells them to', 'They have no nerves'],
      answer: 1,
      explain: 'This is reciprocal inhibition: a branch of the sensory fiber switches on an inhibitory neuron, so the opposing muscle does not fight the kick.',
    },
  ],
  'gene-to-protein': [
    {
      q: 'Where in a human cell is a gene copied into messenger RNA?',
      choices: ['In the cytoplasm, on a ribosome', 'In the nucleus', 'Inside a mitochondrion', 'In the cell membrane'],
      answer: 1,
      explain: 'Transcription happens in the nucleus, where the DNA is. The mRNA then leaves through a nuclear pore.',
    },
    {
      q: 'How many nucleotides make one codon?',
      choices: ['One', 'Two', 'Three', 'Four'],
      answer: 2,
      explain: 'Codons are three letters long, which gives 4³ = 64 possible codons for 20 amino acids and the stop signals.',
    },
    {
      q: 'What does a tRNA do?',
      choices: ['Copies DNA into RNA', 'Carries an amino acid and matches its anticodon to a codon', 'Cuts introns out of mRNA', 'Wraps DNA around histones'],
      answer: 1,
      explain: 'tRNAs are the adapters that connect each codon in the mRNA to the right amino acid.',
    },
    {
      q: 'In sickle cell disease, codon GAG in the β-globin gene becomes GTG. What changes in the protein?',
      choices: ['Nothing, the codons mean the same', 'One glutamate becomes a valine', 'The protein stops early', 'Every amino acid changes'],
      answer: 1,
      explain: 'GAG codes for glutamate and GUG for valine, so a single amino acid changes, which is enough to change how hemoglobin behaves.',
    },
  ],
};
