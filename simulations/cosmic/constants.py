"""Physical and astronomical constants in SI units.

Sources
-------
* CODATA 2018 recommended values (NIST, https://physics.nist.gov/cuu/Constants/)
  for c, h, k_B, sigma, G.
* IAU 2015 Resolution B3 nominal solar and planetary values
  (R_sun, L_sun, T_eff_sun, GM_sun, GM_earth, R_earth).
* IAU 2012 Resolution B2 for the astronomical unit (exact).
* WGS 84 / EGM96 for Earth's J2 and rotation rate.
"""

import math

# --- fundamental (CODATA 2018) ---------------------------------------------
C = 299_792_458.0                 # speed of light [m/s] (exact)
H = 6.626_070_15e-34              # Planck constant [J s] (exact)
K_B = 1.380_649e-23               # Boltzmann constant [J/K] (exact)
SIGMA_SB = 5.670_374_419e-8       # Stefan-Boltzmann constant [W m^-2 K^-4]
G = 6.674_30e-11                  # Newtonian gravitational constant [m^3 kg^-1 s^-2]
WIEN_B = 2.897_771_955e-3         # Wien displacement constant [m K]
G0 = 9.806_65                     # standard gravity [m/s^2] (exact, defines Isp in s)

# --- astronomy ---------------------------------------------------------------
AU = 149_597_870_700.0            # astronomical unit [m] (IAU 2012, exact)
DAY = 86_400.0                    # [s]
YEAR = 365.25 * DAY               # Julian year [s]
PARSEC = AU * 648_000 / math.pi   # [m]
J2000_JD = 2_451_545.0            # Julian date of the J2000.0 epoch

# --- Sun (IAU 2015 B3 nominal values) ----------------------------------------
GM_SUN = 1.327_124_4e20           # [m^3/s^2]
M_SUN = GM_SUN / G                # [kg]
R_SUN = 6.957e8                   # [m]
L_SUN = 3.828e26                  # [W]
T_SUN = 5772.0                    # effective temperature [K]

# --- Earth -------------------------------------------------------------------
GM_EARTH = 3.986_004_418e14       # [m^3/s^2] (WGS 84)
R_EARTH = 6_378_137.0             # equatorial radius [m] (WGS 84)
J2_EARTH = 1.082_626_68e-3        # second zonal harmonic (EGM96)
OMEGA_EARTH = 7.292_115_0e-5      # sidereal rotation rate [rad/s] (WGS 84)
R_EARTH_MEAN = 6_371_000.0        # mean radius [m]
R_JUPITER = 7.1492e7              # equatorial radius [m] (IAU 2015)
R_EARTH_OVER_R_SUN = R_EARTH / R_SUN

# --- planets (GM, equatorial radius) in km-based units for mission design ----
MU_SUN_KM = GM_SUN / 1e9          # [km^3/s^2]
MU_EARTH_KM = GM_EARTH / 1e9      # [km^3/s^2]
MU_MARS_KM = 42_828.37            # [km^3/s^2] (JPL DE440)
R_EARTH_KM = R_EARTH / 1e3
R_MARS_KM = 3_396.19
