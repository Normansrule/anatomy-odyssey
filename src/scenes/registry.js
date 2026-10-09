// Scene registry: every dive step names one of these builders.
// Shared library scenes live in src/library/ and are listed here once;
// any dive that reaches them reuses the same builder.
import { buildBody, buildSkeletonScene } from './body.js';
import { buildFemur } from './femur.js';
import { buildBoneTissue } from './boneTissue.js';
import { buildOsteocyte } from './osteocyte.js';
import { buildHeart } from './heart.js';
import { buildBlood } from './blood.js';
import { buildRedBloodCell } from './redBloodCell.js';
import { buildMuscle } from './muscle.js';
import { buildFascicle } from './fascicle.js';
import { buildMuscleFiber } from './muscleFiber.js';
import { buildSarcomere } from './sarcomere.js';
import { buildLymphNode } from './lymphNode.js';
import { buildFollicle } from './follicle.js';
import { buildPlasmaCell } from './plasmaCell.js';
import { buildInflammation } from './inflammation.js';
import { buildBrain } from './brain.js';
import { buildCortex } from './cortex.js';
import { buildNeuron } from './neuron.js';
import { buildSynapse } from './synapse.js';
import { buildLungs } from './lungs.js';
import { buildAlveoli } from './alveoli.js';
import { buildGasExchange } from './gasExchange.js';
import { buildGeneExpression } from './geneExpression.js';
import { buildBodyElements } from './bodyElements.js';
import { buildCarbonicAnhydrase } from './carbonicAnhydrase.js';
import { buildBicarbonateBuffer } from './bicarbonateBuffer.js';
import { buildImmuneCells } from './immuneCells.js';
import { buildImmuneMemory } from './immuneMemory.js';
import { buildAntigenPresentation } from './antigenPresentation.js';
import { buildKillerTCell } from './killerTCell.js';
import { buildTcrMhc } from './tcrMhc.js';
import { buildReflexArc } from './reflexArc.js';
import { buildSpinalCord } from './spinalCord.js';
import { buildSmallIntestine } from './smallIntestine.js';
import { buildVilli } from './villi.js';
import { buildEnterocyte } from './enterocyte.js';
import { buildNeuromuscularJunction } from './neuromuscularJunction.js';
import { buildGlucose, buildAcetylcholine, buildHistamine, buildUrea, buildThyroxine, buildVitaminD3, buildRetinal, buildBilirubin, buildVanillin } from '../library/smallMolecules.js';
import { buildNasalCavity } from './nasalCavity.js';
import { buildOlfactoryEpithelium } from './olfactoryEpithelium.js';
import { buildOlfactoryCilium } from './olfactoryCilium.js';
import { buildLiver } from './liver.js';
import { buildLobule } from './lobule.js';
import { buildHepatocyte } from './hepatocyte.js';
import { buildEye } from './eye.js';
import { buildRetina } from './retina.js';
import { buildPhototransduction } from './phototransduction.js';
import { buildEar } from './ear.js';
import { buildCochlearDuct } from './cochlearDuct.js';
import { buildHairCell } from './hairCell.js';
import { buildPancreas } from './pancreas.js';
import { buildIslet } from './islet.js';
import { buildBetaCell } from './betaCell.js';
import { buildSkinBlock } from './skinBlock.js';
import { buildEpidermis } from './epidermis.js';
import { buildSunAndSkin } from './sunAndSkin.js';
import { buildThyroid } from './thyroid.js';
import { buildThyroidFollicles } from './thyroidFollicles.js';
import { buildFollicleCell } from './follicleCell.js';
import { buildKidney } from './kidney.js';
import { buildNephron } from './nephron.js';
import { buildFiltrationBarrier } from './filtrationBarrier.js';
import { buildMastCell } from './mastCell.js';
import { buildNucleus } from '../library/nucleus.js';
import { buildDna } from '../library/dna.js';
import { buildHemoglobin } from '../library/hemoglobin.js';
import { buildHeme } from '../library/heme.js';
import { buildActinMyosin } from '../library/actinMyosin.js';
import { buildAntibody } from '../library/antibody.js';
import { buildNeurotransmitter } from '../library/neurotransmitter.js';
import { buildLipidBilayer } from '../library/lipidBilayer.js';
import { buildGases } from '../library/gases.js';
import { buildRna } from '../library/rna.js';
import { buildNucleotides } from '../library/nucleotides.js';
import { buildNucleosome } from '../library/nucleosome.js';
import { buildAminoAcids } from '../library/aminoAcids.js';
import { buildAtp } from '../library/atp.js';
import { buildPhospholipid } from '../library/phospholipid.js';

export const SCENES = {
  body: buildBody,
  skeleton: buildSkeletonScene,
  femur: buildFemur,
  'bone-tissue': buildBoneTissue,
  osteocyte: buildOsteocyte,
  heart: buildHeart,
  blood: buildBlood,
  'red-blood-cell': buildRedBloodCell,
  muscle: buildMuscle,
  fascicle: buildFascicle,
  'muscle-fiber': buildMuscleFiber,
  sarcomere: buildSarcomere,
  'lymph-node': buildLymphNode,
  follicle: buildFollicle,
  'plasma-cell': buildPlasmaCell,
  inflammation: buildInflammation,
  brain: buildBrain,
  cortex: buildCortex,
  neuron: buildNeuron,
  synapse: buildSynapse,
  lungs: buildLungs,
  alveoli: buildAlveoli,
  'gas-exchange': buildGasExchange,
  'gene-expression': buildGeneExpression,
  'body-elements': buildBodyElements,
  'carbonic-anhydrase': buildCarbonicAnhydrase,
  'bicarbonate-buffer': buildBicarbonateBuffer,
  'immune-cells': buildImmuneCells,
  'immune-memory': buildImmuneMemory,
  'antigen-presentation': buildAntigenPresentation,
  'killer-t-cell': buildKillerTCell,
  'tcr-mhc': buildTcrMhc,
  'reflex-arc': buildReflexArc,
  'spinal-cord': buildSpinalCord,
  'small-intestine': buildSmallIntestine,
  villi: buildVilli,
  enterocyte: buildEnterocyte,
  'neuromuscular-junction': buildNeuromuscularJunction,
  glucose: buildGlucose,
  acetylcholine: buildAcetylcholine,
  histamine: buildHistamine,
  urea: buildUrea,
  kidney: buildKidney,
  nephron: buildNephron,
  'filtration-barrier': buildFiltrationBarrier,
  thyroxine: buildThyroxine,
  thyroid: buildThyroid,
  'thyroid-follicles': buildThyroidFollicles,
  'follicle-cell': buildFollicleCell,
  'vitamin-d3': buildVitaminD3,
  'skin-block': buildSkinBlock,
  epidermis: buildEpidermis,
  'sun-and-skin': buildSunAndSkin,
  retinal: buildRetinal,
  eye: buildEye,
  retina: buildRetina,
  phototransduction: buildPhototransduction,
  ear: buildEar,
  'cochlear-duct': buildCochlearDuct,
  'hair-cell': buildHairCell,
  pancreas: buildPancreas,
  islet: buildIslet,
  'beta-cell': buildBetaCell,
  bilirubin: buildBilirubin,
  liver: buildLiver,
  lobule: buildLobule,
  hepatocyte: buildHepatocyte,
  vanillin: buildVanillin,
  'nasal-cavity': buildNasalCavity,
  'olfactory-epithelium': buildOlfactoryEpithelium,
  'olfactory-cilium': buildOlfactoryCilium,
  'mast-cell': buildMastCell,
  nucleus: buildNucleus,
  dna: buildDna,
  hemoglobin: buildHemoglobin,
  heme: buildHeme,
  'actin-myosin': buildActinMyosin,
  antibody: buildAntibody,
  neurotransmitter: buildNeurotransmitter,
  'lipid-bilayer': buildLipidBilayer,
  gases: buildGases,
  rna: buildRna,
  nucleotides: buildNucleotides,
  nucleosome: buildNucleosome,
  'amino-acids': buildAminoAcids,
  atp: buildAtp,
  phospholipid: buildPhospholipid,
};

export const SCENE_IDS = Object.keys(SCENES);
