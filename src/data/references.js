// Reading list. Every card cites one or more of these by id.
export const REFERENCES = {
  openstax: {
    text: 'Betts, J. G., et al. Anatomy and Physiology 2e. OpenStax, 2022 (CC BY 4.0).',
    url: 'https://openstax.org/details/books/anatomy-and-physiology-2e',
  },
  'openstax-bone': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 6: Bone Tissue and the Skeletal System.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/6-introduction',
  },
  'openstax-cell': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 3: The Cellular Level of Organization.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/3-introduction',
  },
  bonewald: {
    text: 'Bonewald, L. F. "The amazing osteocyte." Journal of Bone and Mineral Research 26(2):229–238, 2011.',
    url: 'https://doi.org/10.1002/jbmr.320',
  },
  alberts: {
    text: 'Alberts, B., et al. Molecular Biology of the Cell, 6th ed. Garland Science, 2014.',
    url: 'https://wwnorton.com/books/9780815345244',
  },
  watsoncrick: {
    text: 'Watson, J. D., and Crick, F. H. C. "Molecular structure of nucleic acids." Nature 171:737–738, 1953.',
    url: 'https://doi.org/10.1038/171737a0',
  },
  drew1981: {
    text: 'Drew, H. R., et al. "Structure of a B-DNA dodecamer." PNAS 78(4):2179–2183, 1981 (Protein Data Bank (PDB) ID 1BNA).',
    url: 'https://www.rcsb.org/structure/1BNA',
  },
  azevedo: {
    text: 'Azevedo, F. A. C., et al. "Equal numbers of neuronal and nonneuronal cells make the human brain." Journal of Comparative Neurology 513(5):532–541, 2009.',
    url: 'https://doi.org/10.1002/cne.21974',
  },
  ochs: {
    text: 'Ochs, M., et al. "The number of alveoli in the human lung." American Journal of Respiratory and Critical Care Medicine 169(1):120–124, 2004.',
    url: 'https://doi.org/10.1164/rccm.200308-1107OC',
  },
  'openstax-blood': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 18: The Cardiovascular System: Blood.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/18-introduction',
  },
  'openstax-heart': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 19: The Cardiovascular System: The Heart.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/19-introduction',
  },
  'openstax-muscle': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 10: Muscle Tissue.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/10-introduction',
  },
  'openstax-immune': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 21: The Lymphatic and Immune System.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/21-introduction',
  },
  evansfung: {
    text: 'Evans, E., and Fung, Y.-C. "Improved measurements of the erythrocyte geometry." Microvascular Research 4(4):335–347, 1972.',
    url: 'https://doi.org/10.1016/0026-2862(72)90069-6',
  },
  perutz: {
    text: 'Perutz, M. F. "Stereochemistry of cooperative effects in haemoglobin." Nature 228:726–739, 1970.',
    url: 'https://doi.org/10.1038/228726a0',
  },
  huxley1954: {
    text: 'Huxley, H., and Hanson, J. "Changes in the cross-striations of muscle during contraction and stretch and their structural interpretation." Nature 173:973–976, 1954.',
    url: 'https://doi.org/10.1038/173973a0',
  },
  gordon1966: {
    text: 'Gordon, A. M., Huxley, A. F., and Julian, F. J. "The variation in isometric tension with sarcomere length in vertebrate muscle fibres." Journal of Physiology 184:170–192, 1966.',
    url: 'https://doi.org/10.1113/jphysiol.1966.sp007909',
  },
  rayment1993: {
    text: 'Rayment, I., et al. "Structure of the actin-myosin complex and its implications for muscle contraction." Science 261:58–65, 1993.',
    url: 'https://doi.org/10.1126/science.8316858',
  },
  holmes1990: {
    text: 'Holmes, K. C., et al. "Atomic model of the actin filament." Nature 347:44–49, 1990.',
    url: 'https://doi.org/10.1038/347044a0',
  },
  janeway: {
    text: 'Murphy, K., and Weaver, C. Janeway\'s Immunobiology, 9th ed. Garland Science, 2016.',
    url: 'https://wwnorton.com/books/9780815345053',
  },
  victora2022: {
    text: 'Victora, G. D., and Nussenzweig, M. C. "Germinal centers." Annual Review of Immunology 40:413–442, 2022.',
    url: 'https://doi.org/10.1146/annurev-immunol-120419-022408',
  },
  serhan2014: {
    text: 'Serhan, C. N. "Pro-resolving lipid mediators are leads for resolution physiology." Nature 510:92–101, 2014.',
    url: 'https://doi.org/10.1038/nature13479',
  },
  sender2016: {
    text: 'Sender, R., Fuchs, S., and Milo, R. "Revised estimates for the number of human and bacteria cells in the body." PLOS Biology 14(8):e1002533, 2016.',
    url: 'https://doi.org/10.1371/journal.pbio.1002533',
  },
  medzhitov2008: {
    text: 'Medzhitov, R. "Origin and physiological roles of inflammation." Nature 454:428–435, 2008.',
    url: 'https://doi.org/10.1038/nature07201',
  },
  'openstax-nervous': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 12: The Nervous System and Nervous Tissue.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/12-introduction',
  },
  'openstax-brain': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 13: Anatomy of the Nervous System.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/13-introduction',
  },
  'openstax-respiratory': {
    text: 'OpenStax Anatomy and Physiology 2e, chapter 22: The Respiratory System.',
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/22-introduction',
  },
  hursh1939: {
    text: 'Hursh, J. B. "Conduction velocity and diameter of nerve fibers." American Journal of Physiology 127(1):131–139, 1939.',
    url: 'https://doi.org/10.1152/ajplegacy.1939.127.1.131',
  },
  hodgkinhuxley1952: {
    text: 'Hodgkin, A. L., and Huxley, A. F. "A quantitative description of membrane current and its application to conduction and excitation in nerve." Journal of Physiology 117:500–544, 1952.',
    url: 'https://doi.org/10.1113/jphysiol.1952.sp004764',
  },
  sudhof2013: {
    text: 'Südhof, T. C. "Neurotransmitter release: the last millisecond in the life of a synaptic vesicle." Neuron 80(3):675–690, 2013.',
    url: 'https://doi.org/10.1016/j.neuron.2013.10.022',
  },
  clements1996: {
    text: 'Clements, J. D. "Transmitter timecourse in the synaptic cleft: its role in central synaptic function." Trends in Neurosciences 19(5):163–171, 1996.',
    url: 'https://doi.org/10.1016/S0166-2236(96)10024-2',
  },
  singernicolson1972: {
    text: 'Singer, S. J., and Nicolson, G. L. "The fluid mosaic model of the structure of cell membranes." Science 175:720–731, 1972.',
    url: 'https://doi.org/10.1126/science.175.4023.720',
  },
  gehr1978: {
    text: 'Gehr, P., Bachofen, M., and Weibel, E. R. "The normal human lung: ultrastructure and morphometric estimation of diffusion capacity." Respiration Physiology 32(2):121–140, 1978.',
    url: 'https://doi.org/10.1016/0034-5687(78)90104-4',
  },
  wagner1977: {
    text: 'Wagner, P. D. "Diffusion and chemical reaction in pulmonary gas exchange." Physiological Reviews 57(2):257–312, 1977.',
    url: 'https://doi.org/10.1152/physrev.1977.57.2.257',
  },
  pubchem: {
    text: 'PubChem compound records: L-glutamic acid (CID 33032), oxygen (CID 977), carbon dioxide (CID 280). National Library of Medicine.',
    url: 'https://pubchem.ncbi.nlm.nih.gov/',
  },
};
