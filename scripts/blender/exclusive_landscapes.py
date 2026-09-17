"""Map-owned ground compositions, each with a distinct silhouette and construction."""
import math
from environment_modeling import *

def landscape(slug,i):
    if slug=='village':
        if i==0:
            for k in range(7):
                a=k*math.pi/6; box((math.cos(a)*1.6,math.sin(a)*.92,.25),(.62,.47,.48),'B8B18F',a)
                orb((math.cos(a)*1.6,math.sin(a)*.92,.62),(.43,.35,.31),'97B38A')
            for x in [-.8,0,.8]: blossom((x,.27,.3),.38,'E4B9C3')
        elif i==1:
            for k in range(3):
                box((k*.29,0,.14+k*.2),(2.9-k*.55,1.2,.24),'C0BDA0')
            for x in [-1.1,1.1]: cone((x,.46,.3),.3,.36,.6,'D09D7E',9); blossom((x,.46,.73),.39,'F3DCA8')
        elif i==2:
            box((0,0,.17),(3.15,1.35,.32),'C6AC87');box((0,0,.35),(2.94,1.16,.04),'9F9E7C')
            for k in range(7):
                x=-1.2+k*.4;h=.5+(k%3)*.19
                limb((x,0,.35),(x,0,h),.025,.018,'8FAD76');blossom((x,0,h+.08),.31,'EBCED7' if k%2 else 'F1DCAB')
        else:
            for x in [-1.2,-.6,0,.6,1.2]:
                box((x,0,.63),(.22,.12,1.25),'E0CAA4');cone((x,0,1.32),.16,0,.2,'E0CAA4',4)
            for z in [.36,.87]:box((0,.035,z),(2.75,.09,.1),'BBA27C')
            for x in [-.9,.8]:cone((x,-.43,.22),.26,.33,.44,'C99579',8);blossom((x,-.43,.59),.31,'E3B5C9')
    elif slug=='meadow':
        if i==0:
            for k in range(15):
                a=k*2.39;r=.25+(k%5)*.28;x,y=r*math.cos(a),r*.6*math.sin(a)
                leaf((x,y,.03),(x+.43,y+.12,.43+(k%3)*.09),.16,'AEC67D');leaf((x,y,.02),(x-.22,y+.17,.37),.11,'CBD29D')
        elif i==1:
            for k in range(9):
                x=-1.6+k*.39;y=math.sin(k*.85)*.31;h=.25+(k%3)*.1
                leaf((x,y,0),(x+.17,y+.23,h),.2,'9FBB7D');blossom((x,y,h),.26,'F0DCAD' if k%2 else 'D9BDCD')
        elif i==2:
            path([(-1.4,0,.21),(-.4,.26,.35),(.5,.1,.27),(1.2,-.28,.12)],.27,'B7A67E')
            for x,z in [(-.9,.46),(-.2,.54),(.54,.48)]:
                cone((x,-.24,z),.18,.25,.08,'D8C0A0',7);cone((x,-.24,z-.13),.045,.04,.22,'E8DABD',6)
            for x in [-1,.9]:leaf((x,.28,.17),(x-.29,.61,.79),.3,'A3B880')
        else:
            for x,y in [(-.8,-.3),(0,.37),(.87,-.09)]:
                for a in range(5):leaf((x,y,.04),(x+.48*math.cos(a*1.257),y+.4*math.sin(a*1.257),.31),.15,'B8C893')
                blossom((x,y,.53),.47,'ECD7AF',7)
    elif slug=='lake':
        if i==0:
            for x in [-1.15,-.56,.04,.63,1.18]:
                orb((x,.2,.17),(.43,.51,.18),'9CBAB1')
                for j in range(3):limb((x+j*.07,.28,0),(x+.15+j*.07,.28,.88+j*.23),.018,.01,'94B4A0')
                cone((x+.26,.28,1.17),.055,.05,.27,'B6AC86',6)
        elif i==1:
            for k in range(6):
                x=-1.4+k*.54;orb((x,math.sin(k)*.2,.17),(.44,.31,.18),'A8C2BD')
                for j in range(2):leaf((x,.06,.2),(x+.18*j-.14,-.38,.59),.22,'91B1A0')
        elif i==2:
            for k in range(5):
                a=k*1.25;path([(0,.2,.78),(.52*math.cos(a),.58*math.sin(a),.3),(1.36*math.cos(a),.8*math.sin(a),0)],.12,'8F9E87')
            cone((0,.2,.96),.4,.35,.48,'B4BCA0',7)
            for x in [-.7,.62]:blossom((x,-.19,.28),.37,'DADFC4',6)
        else:
            for x,y in [(-.82,0),(.03,.33),(.92,-.07)]:
                cone((x,y,.07),.54,.52,.12,'9FC5B0',9)
                for a in range(5):leaf((x,y,.14),(x+.32*math.cos(a*1.257),y+.32*math.sin(a*1.257),.32),.11,'DCE3BC')
                orb((x,y,.33),(.1,)*3,'D6C38D')
    elif slug=='farm':
        if i==0:
            for x in [-1.1,-.55,0,.55,1.1]:
                box((x,0,.09),(.4,1.3,.17),'BA9C6D')
                for y in [-.36,.04,.43]:
                    cone((x,y,.2),.05,.13,.34,'D9AA61',7)
                    for a in range(3):leaf((x,y,.37),(x+.19*math.cos(a*2.094),y+.19*math.sin(a*2.094),.65),.07,'99B577')
        elif i==1:
            for x in [-1.15,-.38,.38,1.15]:
                for a in range(6):leaf((x,0,.09),(x+.32*math.cos(a*1.047),.4*math.sin(a*1.047),.43),.21,'A4BF87')
                orb((x,0,.39),(.23,.23,.24),'C7D29A',2)
        elif i==2:
            for x in [-1.2,0,1.2]:limb((x,.12,0),(x,.12,1.21),.05,.04,'B49A6D')
            for z in [.44,.98]:limb((-1.28,.12,z),(1.28,.12,z),.04,.04,'B49A6D')
            for x in [-.9,-.3,.3,.9]:
                for y,z in [(-.18,.53),(.04,.91)]:orb((x,y,z),(.2,.22,.21),'8FA96E');orb((x,y-.21,z),(.095,)*3,'D39964')
        else:
            for x in [-1.07,-.37,.37,1.07]:
                for j in range(3):
                    limb((x+j*.075,0,0),(x+j*.075,.12,.9+j*.12),.02,.012,'BAAC67');orb((x+j*.075,.12,.96+j*.12),(.07,.06,.23),'DCCD86')
            box((0,0,.09),(2.9,.77,.18),'B59F74')
    elif slug=='shore':
        if i==0:
            path([(-1.4,0,.11),(-.56,.2,.35),(.44,.1,.29),(1.48,-.15,.16)],.21,'D1B48C')
            for x,s in [(-.8,1),(.3,-1),(.9,1)]:limb((x,.1,.24),(x+.26,s*.43,.52),.07,.025,'D1B48C')
            for x in [-.56,.57]:ring((x,-.2,.16),.18,.056,'E0CCAA',segments=9)
        elif i==1:
            for x,z,r in [(-1,.42,.6),(-.09,.6,.68),(.97,.33,.55)]:
                orb((x,0,z/2),(r,.63,z/2),'D4C09D');orb((x,-.48,.22),(.19,.08,.15),'A7987C')
        elif i==2:
            for k in range(7):
                x=-1.42+k*.45;y=math.sin(k)*.23
                for a in range(4):leaf((x,y,0),(x+.21*math.cos(a*1.57),y+.25*math.sin(a*1.57),.41),.045,'A6B68A')
                orb((x,y,.06),(.31,.26,.07),'DFCAA5')
        else:
            for x,y in [(-.87,.03),(0,.23),(.82,-.15)]:
                for k in range(7):
                    a=k*math.pi/6;limb((x,y,.08),(x+.46*math.cos(a),y+.29*math.sin(a),.12+.27*math.sin(a)),.057,.035,'E6C9B5')
    elif slug=='grave':
        if i==0:
            for x,h in [(-1.1,.91),(-.36,.72),(.4,1.04),(1.11,.79)]:
                box((x,0,h/2),(.43,.26,h),'ABB8C1');cone((x,0,h),.3,0,.28,'C4CBD1',4)
                box((x,-.14,h*.55),(.06,.02,.23),'778C9D')
        elif i==1:
            for x,y in [(-.88,.06),(0,.33),(.92,-.04)]:
                cone((x,y,.25),.43,.4,.48,'92A3B0',8)
                for k in range(5):leaf((x,y,.48),(x+.39*math.cos(k*1.257),y+.39*math.sin(k*1.257),.59),.17,'A5B7B8')
                blossom((x,y,.71),.36,'D7CFE0',6)
        elif i==2:
            for x,h in [(-1.1,.6),(-.37,1.09),(.4,.75),(1.12,.47)]:
                box((x,0,h/2),(.61,.38,h),'8E9CA8');box((x,0,h+.06),(.7,.48,.12),'BAC4C7')
                for j in range(2):leaf((x,0,h*.5),(x+.29,-.23,h*.7+j*.18),.2,'95ADAE')
        else:
            for k in range(11):
                a=k*math.tau/11;x,y=1.26*math.cos(a),.65*math.sin(a)
                cone((x,y,.16),.07,.07,.32,'DDD9C4',7);orb((x,y,.37),(.03,.03,.07),'E9C88C')
            box((0,0,.12),(1.4,.52,.22),'ACBAC1');blossom((0,0,.36),.31,'CAC6DD')
    elif slug=='ruins':
        if i==0:
            for x,y,h in [(-1.1,0,.34),(-.5,.3,.61),(.12,.2,.94),(.73,.17,.55),(1.23,-.12,.29)]:cone((x,y,h/2),.43,.4,h,'B4BEA7',6)
            for x in [-.61,.6]:cone((x,-.31,.24),.2,.2,.06,'78A19B',6)
        elif i==1:
            for k in range(7):
                a=k*math.pi/6;cone((1.27*math.cos(a),.71*math.sin(a),.22),.36,.36,.42,'BFC5A9',6)
            for x in [-.7,.05,.74]:
                leaf((x,.13,.09),(x+.33,.36,.8),.29,'8AAD96');leaf((x,.13,.09),(x-.3,-.23,.62),.24,'9FB797')
        elif i==2:
            for x,z in [(-.89,.31),(0,.57),(.97,.38)]:
                cone((x,0,z/2),.54,.49,z,'D0CEB1',6)
                for a in range(3):box((x+math.cos(a*2.094)*.24,math.sin(a*2.094)*.24,z+.025),(.13,.2,.03),'729B97',a)
        else:
            for k in range(5):
                x=-1.3+k*.65;limb((x,0,.12),(x+.41,.08,.38),.23,.23,'B4C0A7',6)
            for x in [-.7,.61]:leaf((x,.1,.33),(x+.18,.43,.77),.28,'7FAE96')
    elif slug=='ridge':
        if i==0:
            for x,y,h in [(-.95,.17,1.5),(0,.27,2),(.96,.11,1.36)]:
                limb((x,y,0),(x,y,h),.08,.03,'9C8065')
                for z,r in [(h*.37,.52),(h*.62,.4),(h*.83,.25)]:cone((x,y,z),r,0,h*.46,'809B83',5)
        elif i==1:
            for k in range(5):
                x=-1.28+k*.61;orb((x,0,.17),(.4,.35,.22),'9DAA9B')
                leaf((x,.1,.15),(x-.19,.55,.43),.13,'A1B588')
        elif i==2:
            for x in [-1.1,-.4,.38,1.1]:
                cone((x,0,.39),.31,.25,.74,'A68963',7);cone((x,0,.78),.25,.24,.045,'D0BB94',7)
                for a in [0,2,4]:limb((x,0,.2),(x+.43*math.cos(a),.36*math.sin(a),.01),.07,.025,'A68963')
        else:
            for k in range(7):
                x=-1.4+k*.45;y=math.sin(k)*.22
                for a in range(4):leaf((x,y,0),(x+.32*math.cos(a*1.57),y+.29*math.sin(a*1.57),.6),.11,'8CA88B')
                orb((x,y,.64),(.075,.065,.075),'D1AD83')
    elif slug=='highland':
        if i==0:
            for k in range(4):
                x=-1.05+k*.7;box((x,0,.17+k*.1),(.91,1.04,.26+k*.12),'AAA5B7',-.15+k*.13)
                box((x,-.53,.2),(.41,.035,.035),'D1C4CD')
        elif i==1:
            for k in range(9):
                a=k*2.39;r=.3+(k%4)*.37;x,y=math.cos(a)*r,math.sin(a)*r*.6
                for j in range(3):leaf((x,y,0),(x+.24*math.cos(j*2.094),y+.26*math.sin(j*2.094),.46),.16,'B2BDC0')
                blossom((x,y,.54),.2,'DDD0DB',4)
        elif i==2:
            for k in range(8):
                a=k*math.tau/8;orb((1.33*math.cos(a),.72*math.sin(a),.21),(.34,.28,.22),'AAA3B8')
            cone((0,0,.11),.49,.45,.19,'8F9BAF',9);orb((0,0,.31),(.31,.28,.24),'C3B9C8')
        else:
            for x,h in [(-1.1,.72),(-.37,1.17),(.4,.83),(1.1,.53)]:
                cone((x,0,h/2),.3,.14,h,'ACAAC1',5)
                leaf((x,0,h), (x+.47,.1,h+.29),.25,'CEC3D8')
    elif slug=='frost':
        if i==0:
            for k in range(6):
                x=-1.38+k*.54;h=.43+(k%3)*.23;box((x,0,h/2),(.65,1.04,h),'A7CFDA',.07*k)
                box((x,0,h+.055),(.7,1.07,.1),'DCEDEA',.07*k)
        elif i==1:
            for k in range(9):
                x=-1.35+k*.34;h=.34+(k%4)*.29;cone((x,math.sin(k)*.24,h/2),.11,.11,h,'A6D4DE',5);cone((x,math.sin(k)*.24,h+.16),.11,0,.31,'DAEEEB',5)
        elif i==2:
            for x,y in [(-.94,.1),(0,.34),(.97,-.02)]:
                for a in range(6):
                    t=a*math.pi/3;limb((x,y,.07),(x+.5*math.cos(t),y+.45*math.sin(t),.35),.028,.013,'CBE8E9')
                    leaf((x,y,.12),(x+.41*math.cos(t),y+.39*math.sin(t),.44),.1,'A5D1DC')
        else:
            for x,h in [(-1.02,.59),(0,.93),(1.03,.56)]:orb((x,0,h*.3),(.73,.55,h*.5),'DEEDE8',2)
            path([(-1.3,-.31,.17),(-.57,-.45,.26),(.11,-.5,.2),(.91,-.4,.11)],.026,'97C4D5')
    elif slug=='tide':
        if i==0:
            for x,h in [(-1.14,.77),(-.37,1.25),(.44,.98),(1.1,.64)]:
                path([(x,0,0),(x-.09,0,h*.58),(x+.12,0,h)],.07,'DCB6A8')
                for s in [-1,1]:path([(x,0,h*.4),(x+s*.32,0,h*.59),(x+s*.39,0,h*.87)],.05,'E3C4B3')
        elif i==1:
            for x,y in [(-.9,.08),(0,.33),(.96,-.05)]:
                for a in range(8):leaf((x,y,.12),(x+.49*math.cos(a*.785),y+.48*math.sin(a*.785),.51),.14,'A4CDB5')
                cone((x,y,.23),.19,.2,.32,'CCB8B0',8)
        elif i==2:
            for k in range(5):
                x=-1.24+k*.61;cone((x,0,.22),.43,.44,.41,'9EC7C0',9)
                cone((x,0,.44),.33,.34,.035,'77A9AD',9)
                orb((x,.01,.52),(.15,)*3,'DFDFBE')
        else:
            for x,y,h in [(-1.08,.02,.6),(-.35,.2,1.05),(.35,0,.78),(1.08,.1,.55)]:
                cone((x,y,h/2),.25,.33,h,'B5CDB8',8);ring((x,y,h),.28,.06,'E2CDB6',segments=8)
    elif slug=='iron':
        if i==0:
            for k in range(5):
                x=-1.29+k*.65;cone((x,0,.28),.35,.34,.56,'899A9F',6)
                for a in range(3):box((x+.21*math.cos(a*2.094),.21*math.sin(a*2.094),.58),(.13,.13,.04),'CABD96',a)
        elif i==1:
            box((0,0,.13),(3.1,.83,.25),'7D9496')
            for k in range(6):
                x=-1.25+k*.5;limb((x,-.4,.36),(x,.4,.36),.16,.16,'B5C0B3',8)
                ring((x,-.41,.36),.12,.03,'D4C399','Y',8)
        elif i==2:
            for x,y,z in [(-.92,0,.24),(-.23,.2,.26),(.51,.03,.24),(1.15,.08,.21),(0,.2,.7)]:orb((x,y,z),(.39,.35,.28),'A0ABB3')
            for x in [-1.35,1.35]:box((x,0,.27),(.12,1.07,.54),'B8A985')
        else:
            for k in range(4):
                x=-1.08+k*.73;box((x,0,.21),(.66,1,.39),'A6B2A7')
                for y in [-.29,0,.29]:box((x,y,.44),(.49,.07,.045),'6C8A91')
            limb((-1.5,.59,.32),(1.5,.59,.32),.09,.09,'BEA878',8)
    elif slug=='dragon':
        if i==0:
            for k in range(5):
                x=-1.24+k*.64;h=.47+(k%3)*.29;cone((x,0,h/2),.37,.28,h,'867B96',5);cone((x,0,h+.14),.28,.07,.29,'B7A3BF',5)
        elif i==1:
            for x,h in [(-1.1,.81),(-.36,1.43),(.4,1.17),(1.1,.74)]:
                cone((x,0,.16),.29,.27,.3,'9C8B9D',7)
                path([(x,0,.25),(x-.11,.04,h*.71),(x+.19,.03,h)],.13,'D6C5B2')
        elif i==2:
            for k in range(7):
                x=-1.34+k*.44;y=(k%2)*.31
                mesh('fallen broad dragon scale',[(x-.3,y,.12),(x+.3,y,.12),(x+.24,y+.32,.2),(x,y+.56,.07),(x-.24,y+.32,.2)],[(0,1,2,3,4)],'B8A6BB')
        else:
            for x,y in [(-.92,0),(0,.27),(.88,-.02)]:
                for a in range(5):leaf((x,y,0),(x+.42*math.cos(a*1.257),y+.4*math.sin(a*1.257),.4),.17,'A298B5')
                cone((x,y,.42),.11,.08,.72,'C4B1CF',5);cone((x,y,.88),.08,0,.19,'E2D1DF',5)
    elif slug=='champion':
        if i==0:
            for x in [-1.08,-.36,.36,1.08]:
                box((x,0,.19),(.64,.65,.37),'C6CBB7');cone((x,0,.63),.37,.3,.49,'A3BC98',8);cone((x,0,.97),.29,.1,.26,'BDD0A4',8)
        elif i==1:
            box((0,0,.15),(3.15,1.11,.27),'D4D5BA')
            for x in [-1.13,-.39,.39,1.13]:
                for y in [-.21,.21]:blossom((x,y,.46),.28,'E8D8B3',5)
                leaf((x,0,.28),(x+.23,0,.57),.13,'B4C6A0')
        elif i==2:
            for k in range(6):
                x=-1.33+k*.53;box((x,0,.14),(.49,.84,.27),'C7CDBD')
                cone((x,0,.34),.2,.16,.14,'D8C492',8)
            for x in [-1.58,1.58]:pedestal((x,0,0),.4,.62,.61,'BCC8BC');orb((x,0,.76),(.19,)*3,'DFD8B6')
        else:
            for x in [-1.1,0,1.1]:
                cone((x,0,.25),.28,.37,.49,'D1D0B3',8);limb((x,0,.45),(x,0,1.13),.038,.027,'B4A480')
                orb((x,0,1.22),(.46,.36,.39),'B3C89E',2)
                ring((x,0,1.2),.34,.026,'DFD0A0','Y',12)
