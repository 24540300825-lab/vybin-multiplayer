# Builds the three Christmas assets for VIBE LAB (house L2):
#   assets/season-christmas-house.glb  root 'exterior@L2-2'  (the rooftop storey seen from every L2 map, world frame of map-exterior)
#   assets/map-xmasdeck.glb            balcony map (room-local, deck = floor 0): same storey, closed cottage, walkable porch
#   assets/map-xmasin.glb              interior map (room-local, cottage floor = 0): section cut (no front wall / roof)
import sys, time, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xm_common import *
from xm_house import build_house
from xm_deck import build_deck
from xm_interior import build_interior
from xb import write_glb, Node
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/xmas_out'
os.makedirs(OUT, exist_ok=True)
t0 = time.time()
H = build_house('ext'); D = build_deck()

def storey_nodes(H, D, walk_name='Walk_XM_Porch'):
    house = Node('XM_House', children=[
        Node('XM_House_Shell', H['shell'].merge(H['timber']).merge(H['porch']).merge(H['porch_t'])),
        Node('XM_House_Stone', H['stone']),
        Node('XM_House_Roof', H['roof']),
        Node('XM_House_Snow', H['snow']),
        Node('XM_House_Windows', H['win_frame'].merge(H['win_glass'])),
        Node('XM_House_WindowLight', H['win_card']),
        Node('XM_Door_Main', H['door']),
        Node('XM_House_Decor', H['decor']),
        Node(walk_name, H['walk']),
    ])
    deck = [Node('XM_Deck_Center', D['center']), Node('XM_PadL', D['padL']), Node('XM_PadR', D['padR']),
            Node('XM_Deck_Snow', D['snow']), Node('XM_Deck_Support', D['support'])]
    return [house] + deck

# 1) season decor (world frame of map-exterior-l2: glTF = (X, Z, -Y))
root = Node('exterior@L2-2', children=storey_nodes(H, D))
n1 = write_glb(f'{OUT}/season-christmas-house.glb', [root], MATS)
# 2) balcony map
H2 = build_house('ext'); D2 = build_deck()
root = Node('XMASDECK', children=storey_nodes(H2, D2))
n2 = write_glb(f'{OUT}/map-xmasdeck.glb', [root], MATS, local=BAL_LOCAL)
# 3) interior map
Hi = build_house('int'); Di = build_interior()
kids = [Node('XM_In_Shell', Hi['shell'].merge(Hi['timber'])), Node('XM_In_Stone', Hi['stone']),
        Node('XM_In_Windows', Hi['win_frame'].merge(Hi['win_glass']).merge(Hi['win_card'])), Node('XM_In_SillSnow', Hi['snow']),
        Node('XM_In_Porch', Hi['walk'])]
kids += [Node(k, g) for k, g in Di.items() if not g.empty()]
root = Node('XMASIN', children=kids)
n3 = write_glb(f'{OUT}/map-xmasin.glb', [root], MATS, local=INT_LOCAL)
tri = lambda Gs: sum(g.tri_count() for g in Gs)
print('season', n1, 'deck', n2, 'interior', n3, 'tris ext', tri(list(H.values()) + list(D.values())), 'int', tri(list(Hi.values()) + list(Di.values())), round(time.time() - t0, 1), 's')
