/*

This module adds support for modifying a schedule
directly on the canvas with mouse or touch

*/

window.interactCanvas = (function(){
	//private:

	var mouseHover = {},
	activeElements = [],
	hoverDistance = 6,
	selectedOpacity = 1;


	function getCoordinates(e,canvas){
		var mouseX,mouseY;
		//origo is (0,0)
		var boundingRect = canvas.getBoundingClientRect();
		
		var width = interactCanvas.canvas.width;
		var height = interactCanvas.canvas.height;

		if (e.changedTouches){
			mouseX = e.changedTouches[0].clientX - boundingRect.left;
			mouseY = e.changedTouches[0].clientY - boundingRect.top;
		}

		else{
			mouseX = e.clientX - boundingRect.left;
			mouseY = e.clientY - boundingRect.top;
		}

		console.log(mouseX-width/2,mouseY-height/2)

		return {
			x : mouseX-width/2,
			y : mouseY-height/2
		};
	}

	function hitDetect(coordinates){
		var canvas = napchartCore.getCanvas();
		var data = data = napchartCore.getSchedule();
		var barConfig = draw.getBarConfig();


		// will return:
		// name (core, nap, busy)
		// count (0, 1, 2 ..)
		// type (start, end, or middle)

		var hit = {};
		var value, point, i, distance;

		//hit detection of handles (will overwrite current mouseHover object
		//from draw if hovering a handle):
		for(var name in data){
			if(typeof barConfig[name].rangeHandles == 'undefined' || !barConfig[name].rangeHandles)
				continue;

			for(i = 0; i < data[name].length; i++){

				// if element is not selected, continue
				if(!napchartCore.isSelected(name,i))
					continue;

				for(s = 0; s < 2; s++){
					value = data[name][i][['start','end'][s]];
					point = helpers.minutesToXY(value,barConfig[name].outerRadius*draw.drawRatio);

					distance = helpers.distance(point.x,point.y,coordinates.x,coordinates.y);
					if(distance < hoverDistance*draw.drawRatio){

						if(typeof hit.distance=='undefined'||distance < hit.distance){
							//overwrite current hit object
							hit = {
								name:name,
								count:i,
								type:['start','end'][s],
								distance:distance
							};
						}
					}
				}
			}
		}

		//if no handle is hit, check for middle hit

		if(Object.keys(hit).length == 0){
			var minutes, distanceToCenter;
			var start, end;
			var outerRadius, innerRadius;

			var positionInElement;


			minutes = helpers.XYtoMinutes(coordinates.x,coordinates.y);
			distanceToCenter = helpers.distance(coordinates.x,coordinates.y,0,0);

			//loop through elements
			for(var name in data){
				for(i = 0; i < data[name].length; i++){
					//check if point is inside element horizontally
					start = data[name][i].start;
					end = data[name][i].end;
					if(helpers.pointIsInside(minutes,start,end)){

						//check if point is inside element vertically
						innerRadius = barConfig[name].innerRadius*draw.drawRatio;
						outerRadius = barConfig[name].outerRadius*draw.drawRatio;
						if(distanceToCenter > innerRadius && distanceToCenter < outerRadius){

							positionInElement = helpers.calc(minutes,-start);
							hit = {
								name:name,
								count:i,
								type:'whole',
								positionInElement:positionInElement
							};
						}


					}

				}
			}
		}
		
		if(Object.keys(hit).length == 0)
			return false;

		return hit;
	}

	function hover(e){
		var canvas = napchartCore.getCanvas(),
		coordinates = getCoordinates(e,canvas),
		data = napchartCore.getSchedule(),
		barConfig = draw.getBarConfig();

		helpers.requestAnimFrame.call(window,draw.drawUpdate);

		var hit = hitDetect(coordinates);

		mouseHover = hit;

	}


	function down(e){
		e.stopPropagation();

		console.info('down');

		var canvas = e.target || e.srcElement;
		var coordinates = getCoordinates(e,canvas);
		var hit;

		hit = hitDetect(coordinates);

		//return of no hit
		if(!hit){
			deselect();
			return;
		}

		e.preventDefault();

		//set identifier
		if(typeof e.changedTouches != 'undefined'){
			hit.identifier = e.changedTouches[0].identifier;
		}else{
			hit.identifier = 'mouse';
		}

		hit.canvas = canvas;

		//deselect other elements if they are not being touched
		if(activeElements.length === 0){
			deselect();
		}

		activeElements.push(hit);

		if(typeof e.changedTouches != 'undefined'){
			document.addEventListener('touchmove',drag);
		}else{
			document.addEventListener('mousemove',drag);
		}

		select(hit.name,hit.count);
		
		drag(e); //to  make sure the handles positions to the cursor even before movement

		helpers.requestAnimFrame.call(window,draw.drawUpdate);
	}

	function drag(e){
		console.log('drag');
		var identifier;
		identifier = findIdentifier(e);

		var dragElement, name, count, element, coordinates, minutes;

		

		//newValues is an object that will replace the existing one with new values
		var newValues = {}, positionInElement, duration, start, end;


		dragElement = getActiveElement(identifier);
		if(!dragElement){
			return
		}

		name = dragElement.name;
		count = dragElement.count;
		element = napchartCore.returnElement(name,count);
		coordinates = getCoordinates(e,dragElement.canvas);
		minutes = helpers.XYtoMinutes(coordinates.x,coordinates.y);


		if(dragElement.type=='start'){
			start = snap(minutes);
			newValues = {start:start};
		}
		else if(dragElement.type=='end'){
			end = snap(minutes);
			newValues = {end:end};
		}
		else if(dragElement.type=='whole'){
			positionInElement = dragElement.positionInElement;
			duration = helpers.range(element.start,element.end);
			start = helpers.calc(minutes,-positionInElement);
			start = snap(start);
			end = helpers.calc(start,duration);
			newValues = {start:start,end:end};
		}
		
		napchartCore.modifyElement(name,count,newValues);
	}

	function unfocus(e){
		// checks if click is on a part of the site that should make the
		// current selected elements be deselected

		var x, y;
		var domElement

		x = e.clientX;
		y = e.clientY;

		var domElement = document.elementFromPoint(x, y);

		console.log(domElement);
	}

	function select(name,count){
		//notify core module:
		napchartCore.setSelected(name,count);
	}

	function deselect(name,count){
		if(typeof name == 'undefined'){
			//deselect all
			napchartCore.deselect();
			document.removeEventListener('touchmove',drag);
			document.removeEventListener('mousemove',drag);
		}
		//deselect one
		napchartCore.deselect(name,count);
	}

	function findIdentifier(e){
		if(e.type.search('mouse') >= 0){
			return 'mouse';
		}else{
			console.log(e);
			return e.changedTouches[0].identifier;
		}
	}

	function getActiveElement(identifier){
		for(var i = 0; i < activeElements.length; i++){
			if(activeElements[i].identifier == identifier){
				return activeElements[i];
			}
		}
		return false;
	}

	function removeActiveElement(identifier){
		for(var i = 0; i < activeElements.length; i++){
			if(activeElements[i].identifier == identifier){
				activeElements.splice(i,1);
			}
		}
	}

	function up(e){
		var identifier = findIdentifier(e);
		var element = getActiveElement(identifier);

		if(activeElements.length != 0){
			chartHistory.add(napchartCore.getSchedule(),'moved ' + element.name + ' ' + (element.count+1));
		}

		//find the shit to remove
		removeActiveElement(identifier);

		helpers.requestAnimFrame.call(window,draw.drawUpdate);

	}

	function snap(input){
		var output = input;

		//hour
		if(input%60 < 7)
			output = input-input%60;
		else if(input%60 > 53)
			output = input+(60-input%60);

		//half hours
		else{
			input += 30;

			if(input%60 < 5)
				output = input-input%60-30;
			else if(input%60 > 55)
				output = input+(60-input%60)-30;
		}

		return output;
	}

	//public:
	return{
		initialize:function(canvas){
			
			canvas.addEventListener('mousemove',hover);
			canvas.addEventListener('mousedown',down);
			canvas.addEventListener('touchstart',down);
			document.addEventListener('mouseup',up);
			document.addEventListener('touchend',up);
			document.addEventListener('touchstart',deselect);


			var canvasStyles = window.getComputedStyle(canvas);
			var width = canvasStyles.getPropertyValue('width').replace('px','');
			var height = canvasStyles.getPropertyValue('height').replace('px','');

			interactCanvas.canvas = {
				width:width,
				height:height
			};


		},

		setHoverElement:function(hover){
			//ignore if a handle is being hovered
			if(mouseHover.type != 'start' && mouseHover.type != 'end'){
				mouseHover = hover;
			};
		},

		isActive:function(name,count,type){

			for(i=0;i<activeElements.length;i++){

				if(name == activeElements[i].name && count == activeElements[i].count){
					if(typeof type=='undefined' || type == activeElements[i].type)
					return true;
				}
			}
			return false;
		},

		isHover:function(name,count,type){
			if(name == mouseHover.name && count == mouseHover.count){
				if(typeof type=='undefined' || type == mouseHover.type)
				return true;
			}
			return false;
		},

		getSelectedOpacity:function(){
			return selectedOpacity;
		},

		setSelectedOpacity:function(to){
			selectedOpacity = to;
		}
	};

}());