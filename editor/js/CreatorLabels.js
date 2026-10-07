// Only presentation labels change; Three.js values and user-entered names remain intact.
const labels = {
 RGBA:'RGBA（含透明度）',
 Front:'正面', Back:'背面', Double:'双面', Normal:'正常混合', Additive:'叠加', Subtractive:'减色', Multiply:'正片叠底', Custom:'自定义',
 SOLID:'材质预览', REALISTIC:'写实预览', Ultra:'最高', Actions:'操作', 'Reset Position':'位置归零', 'Reset Rotation':'朝向归零', 'Reset Scale':'大小归一', Perspective:'透视', Orthographic:'正交', WebGL:'WebGL 渲染', WebGPU:'WebGPU 渲染', Reinhard:'柔和压缩', Cineon:'电影调色', ACESFilmic:'电影级调色', AgX:'AgX 调色', Neutral:'中性调色', Center:'形状居中', Convert:'转换为自由网格', Flatten:'合并网格', centripetal:'平稳曲线', chordal:'均匀曲线', catmullrom:'平滑曲线', UV:'模型纹理坐标', 'Equirectangular Reflection':'全景反射', 'Equirectangular Refraction':'全景折射', 'Cube Reflection':'立方体反射', 'Cube Refraction':'立方体折射', 'CubeUV Reflection':'立方体纹理反射', Nearest:'像素清晰', 'Nearest Mipmap Nearest':'最近层级像素采样', 'Nearest Mipmap Linear':'层级平滑像素采样', 'Linear Mipmap Nearest':'最近层级平滑采样', 'Linear Mipmap Linear':'全层级平滑采样', sRGB:'标准 sRGB', 'Linear sRGB':'线性 sRGB',
 Default:'默认', Color:'纯色', Texture:'图片贴图', Equirect:'全景贴图', Equirectangular:'全景贴图', None:'无', Linear:'线性', Exponential:'指数衰减',
 realistic:'写实', solid:'材质', normals:'法线方向', wireframe:'线框', Realistic:'写实', Solid:'材质',
 Scene:'场景', Camera:'相机', Object3D:'物件组', Group:'物件组', Mesh:'模型', Points:'粒子点', Line:'线条', LineSegments:'线段', Sprite:'平面精灵',
 PerspectiveCamera:'透视相机', OrthographicCamera:'正交相机', AmbientLight:'环境光', DirectionalLight:'平行光', HemisphereLight:'半球光', PointLight:'点光源', SpotLight:'聚光灯', RectAreaLight:'面光源',
 Box:'立方体', Capsule:'胶囊体', Circle:'圆面', Cylinder:'圆柱体', Dodecahedron:'十二面体', Icosahedron:'二十面体', Lathe:'旋转体', Octahedron:'八面体', Plane:'平面', Ring:'圆环面', Sphere:'球体', Tetrahedron:'四面体', Text:'立体文字', Torus:'圆环体', TorusKnot:'扭结环', Tube:'管道',
 MeshBasicMaterial:'基础材质（不受光）', MeshStandardMaterial:'标准材质', MeshPhysicalMaterial:'物理材质', MeshPhongMaterial:'高光材质', MeshLambertMaterial:'柔和漫反射', MeshToonMaterial:'卡通材质', MeshNormalMaterial:'法线方向材质', MeshDepthMaterial:'深度材质', MeshMatcapMaterial:'预烘焙材质', ShaderMaterial:'自定义着色器', RawShaderMaterial:'底层着色器', ShadowMaterial:'阴影接收材质', SpriteMaterial:'精灵材质', PointsMaterial:'粒子材质', LineBasicMaterial:'线条材质', LineDashedMaterial:'虚线材质',
 FrontSide:'正面', BackSide:'背面', DoubleSide:'双面', NormalBlending:'正常混合', AdditiveBlending:'叠加', SubtractiveBlending:'减色', MultiplyBlending:'正片叠底', CustomBlending:'自定义混合', NoBlending:'不混合',
 RepeatWrapping:'重复铺满', ClampToEdgeWrapping:'边缘延伸', MirroredRepeatWrapping:'镜像重复', NearestFilter:'像素清晰', LinearFilter:'平滑采样', NearestMipmapNearestFilter:'最近层级像素采样', NearestMipmapLinearFilter:'层级平滑像素采样', LinearMipmapNearestFilter:'最近层级平滑采样', LinearMipmapLinearFilter:'全层级平滑采样',
 UVMapping:'按模型纹理坐标', EquirectangularReflectionMapping:'全景反射', EquirectangularRefractionMapping:'全景折射', 'No Color Space':'不转换颜色', 'srgb-linear':'线性 sRGB', srgb:'标准 sRGB',
 WebGLRenderer:'WebGL 渲染', WebGPURenderer:'WebGPU 渲染', Basic:'基础', PCF:'柔和阴影', 'PCF Soft':'更柔和阴影', VSM:'方差阴影', No:'关闭', Yes:'开启', Low:'低', Medium:'中', High:'高',
 LinearToneMapping:'线性调色', ReinhardToneMapping:'柔和压缩', CineonToneMapping:'电影调色', ACESFilmicToneMapping:'电影级调色', AgXToneMapping:'AgX 调色', NeutralToneMapping:'中性调色', NoToneMapping:'原始颜色'
};
for ( const [ type, label ] of Object.entries( labels ) ) {
 if ( ['Box','Capsule','Circle','Cylinder','Dodecahedron','Icosahedron','Lathe','Octahedron','Plane','Ring','Sphere','Tetrahedron','Torus','TorusKnot','Tube','Text'].includes( type ) ) labels[ type + 'Geometry' ] = label + '网格';
}
labels.BufferGeometry = '自由形状网格'; labels.ShapeGeometry = '轮廓网格'; labels.ExtrudeGeometry = '挤出网格';
export function creatorLabel( value ) { return labels[ value ] ?? value; }
