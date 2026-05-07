package main

import (
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"math"
	"os"
	"path/filepath"

	"github.com/chai2010/webp"
)

const (
	landBit      byte = 0b10000000
	shorelineBit byte = 0b01000000
	oceanBit     byte = 0b00100000
)

type Config struct {
	Seed           uint32   `json:"seed"`
	Width          int      `json:"width"`
	Height         int      `json:"height"`
	Name           string   `json:"name"`
	ThumbnailScale float64  `json:"thumbnailScale"`
	SelectedStarts int      `json:"selectedStarts"`
	Galaxies       []Galaxy `json:"galaxies"`
}

type Galaxy struct {
	Name  string  `json:"name"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	RX    float64 `json:"rx"`
	RY    float64 `json:"ry"`
	Nodes int     `json:"nodes"`
	Start bool    `json:"start"`
}

type Manifest struct {
	Name    string       `json:"name"`
	Map     MapMetadata  `json:"map"`
	Map4x   MapMetadata  `json:"map4x"`
	Map16x  MapMetadata  `json:"map16x"`
	Nations []NationInfo `json:"nations"`
}

type MapMetadata struct {
	Width        int `json:"width"`
	Height       int `json:"height"`
	NumLandTiles int `json:"num_land_tiles"`
}

type NationInfo struct {
	Coordinates [2]int `json:"coordinates"`
	Flag        string `json:"flag"`
	Name        string `json:"name"`
}

type Review struct {
	Seed                    uint32       `json:"seed"`
	Width                   int          `json:"width"`
	Height                  int          `json:"height"`
	TotalCells              int          `json:"totalCells"`
	SystemCells             int          `json:"systemCells"`
	SpawnCandidateGalaxies  int          `json:"spawnCandidateGalaxies"`
	SelectedStarts          []NationInfo `json:"selectedStarts"`
	Generator               string       `json:"generator"`
	TopologyReviewGuidance  []string     `json:"topologyReviewGuidance"`
	ThumbnailPaletteSummary []string     `json:"thumbnailPaletteSummary"`
}

type rng struct {
	state uint32
}

func (r *rng) next() uint32 {
	r.state = r.state*1664525 + 1013904223
	return r.state
}

func (r *rng) float64() float64 {
	return float64(r.next()) / float64(math.MaxUint32)
}

func (r *rng) intn(n int) int {
	if n <= 0 {
		return 0
	}
	return int(r.next() % uint32(n))
}

func main() {
	cwd, err := os.Getwd()
	if err != nil {
		fatal(err)
	}
	configPath := filepath.Join(cwd, "universe", "config.json")
	raw, err := os.ReadFile(configPath)
	if err != nil {
		fatal(err)
	}
	var cfg Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		fatal(err)
	}
	if cfg.Width%4 != 0 || cfg.Height%4 != 0 {
		fatal(fmt.Errorf("width and height must be divisible by 4"))
	}

	density := make([]uint16, cfg.Width*cfg.Height)
	random := rng{state: cfg.Seed}

	for index, galaxy := range cfg.Galaxies {
		carveGalaxy(density, cfg.Width, cfg.Height, galaxy, &random, index)
	}

	full := packMap(density, cfg.Width, cfg.Height)
	map4xDensity := downscaleDensity(density, cfg.Width, cfg.Height)
	map4x := packMap(map4xDensity, cfg.Width/2, cfg.Height/2)
	map16xDensity := downscaleDensity(map4xDensity, cfg.Width/2, cfg.Height/2)
	map16x := packMap(map16xDensity, cfg.Width/4, cfg.Height/4)

	nations := selectedStarts(cfg, density)
	manifest := Manifest{
		Name:    cfg.Name,
		Map:     MapMetadata{Width: cfg.Width, Height: cfg.Height, NumLandTiles: full.landTiles},
		Map4x:   MapMetadata{Width: cfg.Width / 2, Height: cfg.Height / 2, NumLandTiles: map4x.landTiles},
		Map16x:  MapMetadata{Width: cfg.Width / 4, Height: cfg.Height / 4, NumLandTiles: map16x.landTiles},
		Nations: nations,
	}

	outDir := filepath.Join(cwd, "..", "resources", "maps", cfg.Name)
	if err := os.MkdirAll(outDir, 0755); err != nil {
		fatal(err)
	}
	writeFile(filepath.Join(outDir, "map.bin"), full.data)
	writeFile(filepath.Join(outDir, "map4x.bin"), map4x.data)
	writeFile(filepath.Join(outDir, "map16x.bin"), map16x.data)
	writeJSON(filepath.Join(outDir, "manifest.json"), manifest)
	writeJSON(filepath.Join(outDir, "review.json"), Review{
		Seed:                   cfg.Seed,
		Width:                  cfg.Width,
		Height:                 cfg.Height,
		TotalCells:             cfg.Width * cfg.Height,
		SystemCells:            full.landTiles,
		SpawnCandidateGalaxies: countSpawnCandidates(cfg),
		SelectedStarts:         nations,
		Generator:              "map-generator/universe/main.go",
		TopologyReviewGuidance: []string{
			"Systems are encoded as OpenFront land and void is encoded as ocean water.",
			"Galaxies are generated as separate connected granular archipelagos with seeded jitter.",
			"Selected starts are one civilization per start-marked galaxy.",
		},
		ThumbnailPaletteSummary: []string{
			"Deep void is near-black navy.",
			"Near-system void lifts subtly through distance shading.",
			"Sparse systems are dim blue-white and denser cores are warm pale gold.",
		},
	})
	writeFile(filepath.Join(outDir, "thumbnail.webp"), thumbnail(full.data, cfg.Width, cfg.Height, cfg.ThumbnailScale))
}

type packedMap struct {
	data      []byte
	landTiles int
}

func carveGalaxy(density []uint16, width int, height int, g Galaxy, random *rng, salt int) {
	centerX := int(math.Round(g.X))
	centerY := int(math.Round(g.Y))
	paint(density, width, height, centerX, centerY, 5, 18)

	for i := 0; i < g.Nodes; i++ {
		angle := random.float64() * math.Pi * 2
		radius := math.Sqrt(random.float64())
		wobble := 0.78 + random.float64()*0.34
		targetX := int(math.Round(g.X + math.Cos(angle)*g.RX*radius*wobble + float64(random.intn(17)-8)))
		targetY := int(math.Round(g.Y + math.Sin(angle)*g.RY*radius*wobble + float64(random.intn(17)-8)))
		lineBrush := 1 + random.intn(2)
		carveLine(density, width, height, centerX, centerY, targetX, targetY, lineBrush, uint16(4+random.intn(8)))

		walkX := targetX
		walkY := targetY
		steps := 42 + random.intn(42) + g.Nodes/7
		for step := 0; step < steps; step++ {
			localAngle := angle + (random.float64()-0.5)*math.Pi*1.4 + math.Sin(float64(step+salt))*0.35
			walkX += int(math.Round(math.Cos(localAngle) * float64(1+random.intn(4))))
			walkY += int(math.Round(math.Sin(localAngle) * float64(1+random.intn(4))))
			if !insideEllipse(float64(walkX), float64(walkY), g) {
				walkX = (walkX + targetX + centerX) / 3
				walkY = (walkY + targetY + centerY) / 3
			}
			brush := 1 + random.intn(3)
			if random.float64() > 0.88 {
				brush++
			}
			paint(density, width, height, walkX, walkY, brush, uint16(7+random.intn(18)))
		}
	}
}

func insideEllipse(x float64, y float64, g Galaxy) bool {
	dx := (x - g.X) / (g.RX * 1.18)
	dy := (y - g.Y) / (g.RY * 1.18)
	return dx*dx+dy*dy <= 1
}

func carveLine(density []uint16, width int, height int, x0 int, y0 int, x1 int, y1 int, brush int, value uint16) {
	dx := x1 - x0
	dy := y1 - y0
	steps := max(abs(dx), abs(dy))
	if steps == 0 {
		paint(density, width, height, x0, y0, brush, value)
		return
	}
	for i := 0; i <= steps; i++ {
		t := float64(i) / float64(steps)
		x := int(math.Round(float64(x0) + float64(dx)*t + math.Sin(t*math.Pi*6)*1.7))
		y := int(math.Round(float64(y0) + float64(dy)*t + math.Cos(t*math.Pi*5)*1.3))
		paint(density, width, height, x, y, brush, value)
	}
}

func paint(density []uint16, width int, height int, cx int, cy int, radius int, value uint16) {
	r2 := radius * radius
	for y := cy - radius; y <= cy+radius; y++ {
		if y < 0 || y >= height {
			continue
		}
		for x := cx - radius; x <= cx+radius; x++ {
			if x < 0 || x >= width {
				continue
			}
			dx := x - cx
			dy := y - cy
			if dx*dx+dy*dy > r2 {
				continue
			}
			ref := y*width + x
			next := density[ref] + value
			if next < density[ref] || next > 31 {
				next = 31
			}
			density[ref] = next
		}
	}
}

func packMap(density []uint16, width int, height int) packedMap {
	land := make([]bool, len(density))
	landTiles := 0
	for i, value := range density {
		if value > 0 {
			land[i] = true
			landTiles++
		}
	}

	distance := distanceToLand(land, width, height)
	data := make([]byte, len(density))
	for ref, isLand := range land {
		magnitude := byte(0)
		if isLand {
			magnitude = byte(min(int(density[ref]), 31))
			data[ref] = landBit | magnitude
		} else {
			magnitude = byte(min(int(math.Ceil(float64(distance[ref])/2)), 31))
			data[ref] = oceanBit | magnitude
		}
		if hasOppositeNeighbor(land, width, height, ref, isLand) {
			data[ref] |= shorelineBit
		}
	}
	return packedMap{data: data, landTiles: landTiles}
}

func distanceToLand(land []bool, width int, height int) []int16 {
	distance := make([]int16, len(land))
	queue := make([]int32, len(land))
	head := 0
	tail := 0
	for i, isLand := range land {
		if isLand {
			distance[i] = 0
			queue[tail] = int32(i)
			tail++
		} else {
			distance[i] = -1
		}
	}
	for head < tail {
		ref := int(queue[head])
		head++
		nextDistance := distance[ref] + 1
		for _, next := range neighbors(ref, width, height) {
			if distance[next] != -1 {
				continue
			}
			distance[next] = nextDistance
			queue[tail] = int32(next)
			tail++
		}
	}
	return distance
}

func hasOppositeNeighbor(land []bool, width int, height int, ref int, isLand bool) bool {
	for _, next := range neighbors(ref, width, height) {
		if land[next] != isLand {
			return true
		}
	}
	return false
}

func downscaleDensity(input []uint16, width int, height int) []uint16 {
	outWidth := width / 2
	outHeight := height / 2
	output := make([]uint16, outWidth*outHeight)
	for y := 0; y < outHeight; y++ {
		for x := 0; x < outWidth; x++ {
			maxValue := uint16(0)
			for yy := 0; yy < 2; yy++ {
				for xx := 0; xx < 2; xx++ {
					value := input[(y*2+yy)*width+x*2+xx]
					if value > maxValue {
						maxValue = value
					}
				}
			}
			output[y*outWidth+x] = maxValue
		}
	}
	return output
}

func selectedStarts(cfg Config, density []uint16) []NationInfo {
	starts := make([]NationInfo, 0, cfg.SelectedStarts)
	for _, galaxy := range cfg.Galaxies {
		if !galaxy.Start {
			continue
		}
		x, y := nearestLand(cfg, density, int(math.Round(galaxy.X)), int(math.Round(galaxy.Y)))
		starts = append(starts, NationInfo{
			Coordinates: [2]int{x, y},
			Flag:        "",
			Name:        galaxy.Name,
		})
		if len(starts) == cfg.SelectedStarts {
			break
		}
	}
	return starts
}

func nearestLand(cfg Config, density []uint16, x int, y int) (int, int) {
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return 0, 0
	}
	x = clamp(x, 0, cfg.Width-1)
	y = clamp(y, 0, cfg.Height-1)
	if density[y*cfg.Width+x] > 0 {
		return x, y
	}
	for radius := 1; radius < max(cfg.Width, cfg.Height); radius++ {
		for yy := y - radius; yy <= y+radius; yy++ {
			for xx := x - radius; xx <= x+radius; xx++ {
				if xx < 0 || xx >= cfg.Width || yy < 0 || yy >= cfg.Height {
					continue
				}
				if abs(xx-x) != radius && abs(yy-y) != radius {
					continue
				}
				if density[yy*cfg.Width+xx] > 0 {
					return xx, yy
				}
			}
		}
	}
	return x, y
}

func thumbnail(data []byte, width int, height int, scale float64) []byte {
	thumbWidth := max(1, int(math.Round(float64(width)*scale)))
	thumbHeight := max(1, int(math.Round(float64(height)*scale)))
	img := image.NewRGBA(image.Rect(0, 0, thumbWidth, thumbHeight))
	for y := 0; y < thumbHeight; y++ {
		sourceY := min(int(float64(y)/scale), height-1)
		for x := 0; x < thumbWidth; x++ {
			sourceX := min(int(float64(x)/scale), width-1)
			img.SetRGBA(x, y, terrainColor(data[sourceY*width+sourceX]))
		}
	}
	bytes, err := webp.EncodeRGBA(img, 80)
	if err != nil {
		fatal(err)
	}
	return bytes
}

func terrainColor(value byte) color.RGBA {
	magnitude := float64(value & 0x1f)
	if value&landBit == 0 {
		lift := uint8(min(8+int(31-magnitude)/2, 24))
		return color.RGBA{R: 5 + lift/4, G: 7 + lift/3, B: 13 + lift, A: 255}
	}
	if magnitude >= 24 {
		warm := uint8(min(190+int(magnitude)*2, 245))
		return color.RGBA{R: warm, G: uint8(min(int(warm)-10, 235)), B: 172, A: 255}
	}
	cool := uint8(min(92+int(magnitude)*4, 180))
	return color.RGBA{R: cool, G: uint8(min(int(cool)+12, 200)), B: uint8(min(int(cool)+34, 230)), A: 255}
}

func countSpawnCandidates(cfg Config) int {
	count := 0
	for _, galaxy := range cfg.Galaxies {
		if galaxy.Nodes >= 80 {
			count++
		}
	}
	return count
}

func neighbors(ref int, width int, height int) []int {
	x := ref % width
	out := make([]int, 0, 4)
	if ref >= width {
		out = append(out, ref-width)
	}
	if ref < (height-1)*width {
		out = append(out, ref+width)
	}
	if x > 0 {
		out = append(out, ref-1)
	}
	if x < width-1 {
		out = append(out, ref+1)
	}
	return out
}

func writeFile(path string, data []byte) {
	if err := os.WriteFile(path, data, 0644); err != nil {
		fatal(err)
	}
}

func writeJSON(path string, value any) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		fatal(err)
	}
	data = append(data, '\n')
	writeFile(path, data)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func clamp(v int, lo int, hi int) int {
	return min(max(v, lo), hi)
}

func min(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
