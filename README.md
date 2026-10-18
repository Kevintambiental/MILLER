# MILLER

EDMUNDS is a standalone, offline soil-contaminant transport simulator.

Open `index.html` in a modern browser, or visit the published site:
https://kevintambiental.github.io/MILLER/

This repository hosts the independent web version and does not replace the
existing `Kevintambiental/EDMUNDS` Python project.

The contaminant selector contains 864 EPA/ORNL RSL Fall 2024 entries and works
offline. It loads only listed Koc, Henry, and diffusion values, records the
parameter row and source labels, and leaves unavailable values blank. EPA soil
screening thresholds are not treated as aqueous mg/L values. Fuel mixtures
such as gasoline, diesel, and petroleum are not assigned a single-contaminant
Koc; select a measured analyte instead.
