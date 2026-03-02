function getParameterByName(name) {
	name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
	var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"), results = regex
	.exec(location.search);
	return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g," "));
}

function login(lang) {

	$.cookie('login', $('#input_user').val(), {'expires' : 10000, 'path' : '/'});
	if($("#remember").is(':checked'))
			$.cookie('password', $('#input_password').val(), {'expires' : 10000, 'path' : '/'});
	else
		$.cookie('password', null, {'expires' : -1, 'path' : '/'});

	var erroHTTP = function(jqXHR, textStatus, errorThrown) {
		if (jqXHR.responseJSON)
		{
			if(jqXHR.responseJSON.error.indexOf("Invalid access level") === 0) {
				$('#div_alert').find('span').html("UsuÃ¡rio sem acesso").end().removeClass('hide');
				$.ajax({
					url: "/logout.fcgi",
					cache: false,
					async: false,
					type: 'POST',
				});
			} else
				$('#div_alert').find('span').html(
					(jqXHR.responseJSON.error==="Invalid user or password" || jqXHR.responseJSON.error==="Invalid login or password") ? "UsuÃ¡rio ou senha invÃ¡lidos" : jqXHR.responseJSON.error).end().removeClass('hide');
		}
		else {
			if (lang == 'en_US') {
				$('#div_alert').find('span').html('Could not connect to the device').end().removeClass('hide');
			}
			else if (lang == 'spa_SPA') {
				$('#div_alert').find('span').html('No se puede conectar a un equipo').end().removeClass('hide');
			}
			else {
				$('#div_alert').find('span').html('NÃ£o foi possÃ­vel conectar ao equipamento').end().removeClass('hide');
			}
		}
	}

	$.ajax({
		url: "/login.fcgi",
		cache: false,
		async: false,
		type: 'POST',
		data:{
			login: $('#input_user').val(),
			password: $('#input_password').val()
		},
		success: function(data) {
			document.cookie = "session=" + data.session + "; path=/";
			var online = false;
			var ip = null;
			var data = {};
			var lang_set = "pt_BR";
			var set_same_lang = false;
			var apply_timeout = false;

			$.ajax({
				url: "/init_language_set.fcgi",
				cache: false,
				async: false,
				type: 'GET',
				success: function(data) {
					if(!data.init_language_set){
						set_same_lang = lang == lang_set;
						$.ajax({
							url: "/finish_init_language.fcgi",
							async: true,
							type: 'GET',
							dataType: "JSON"
						});
					}
				},
				dataType: "JSON"
			});

			if (lang == "en_US" || lang == "spa_SPA" || set_same_lang) {
				apply_timeout = true;

				if (lang == "pt_BR") {
					$('#div_language').find('span').html("Trocando de idioma. Aguarde alguns segundos, por favor.").end().removeClass('hide');
				}
				else if (lang == "en_US") {
					$('#div_language').find('span').html("Changing language. Please wait a few seconds.").end().removeClass('hide');
				}
				else if (lang == "spa_SPA") {
					$('#div_language').find('span').html("Cambio de idioma. Espere unos segundos.").end().removeClass('hide');
				}

				$.ajax({
					url: "/set_configuration.fcgi",
					cache: false,
					async: false,
					contentType:'application/json',
					type: 'POST',
					data: JSON.stringify({
						general: {
							language: lang
						}
					}),
					dataType: "JSON",
					success : function(data){
						lang_set = lang;
					}
				});
			}

			setTimeout(function (language_set) {

				$.ajax({
					url: "/system_information.fcgi",
					async: false,
					type: 'POST',
					contentType : 'application/json',
					success : function(_data){
						data = _data;
					},
					error: erroHTTP
				});

				if(data.license.type == 0){
					online = data.online == 1;
				}

				var catra_role = '0';
				var ssl_enabled = '0';
				if(online === true){
					$.ajax({
						url: "/get_configuration.fcgi",
						async: false,
						type: 'POST',
						contentType : 'application/json',
						data : JSON.stringify({ 'online_client' : ['server_id'], 'sec_box': ['catra_role'], 'general': ['ssl_enabled'] }),
						success: function(data){
							catra_role = data.sec_box.catra_role;
							ssl_enabled = data.general.ssl_enabled;
							if(!isNaN(data.online_client.server_id)){
								$.ajax({
									url: "/load_objects.fcgi",
									async: false,
									type: 'POST',
									contentType : 'application/json',
									data : JSON.stringify({
										'object' : 'devices',
										'where' : [{
											'object' : 'devices',
											'field' : 'id',
											'value' : parseInt(data.online_client.server_id)
										}]
									}),
									success: function(data){
										if(data.devices.length === 1)
											ip = data.devices[0].ip;
									},
									error: erroHTTP
								});
							}else
								online = false;
						},
						error: function() {
							online = false;
						}
					});
				}

				if(online === true){
					if (catra_role === '2') {
						var primary_address = (ssl_enabled === '1' ? "" : "http://") + ip
						if (language_set == 'en_US') {
							$('body').html('<div class="col-md-6 page-404">'+
									'<br /><br /><br />' +
									'<div class="number font-light-red">Warning!</div>'+
									'<div class="details font-light-grey">'+
									'<h3>You are on a secondary device</h3>'+
									'<p>In case you want to go to the primary device <a href="' + primary_address + '">click here</a>, <br />or <a href="/en_US/html/index.html">click here</a> to continue.</p>'+
									'</div>'+
								'</div>');
						}
						else if (language_set == 'spa_SPA') {
							$('body').html('<div class="col-md-6 page-404">'+
									'<br /><br /><br />' +
									'<div class="number font-light-red">Â¡AtenciÃ³n!</div>'+
									'<div class="details font-light-grey">'+
									'<h3>EstÃ¡s en un equipo secundario</h3>'+
									'<p>Si quieres ir al equipo primario <a href="' + primary_address + '">haga clic aquÃ­</a>, <br />o <a href="/spa_SPA/html/index.html">haga clic aquÃ­</a> para continuar.</p>'+
									'</div>'+
								'</div>');
						}
						else {
							$('body').html('<div class="col-md-6 page-404">'+
									'<br /><br /><br />' +
									'<div class="number font-light-red">AtenÃ§Ã£o!</div>'+
									'<div class="details font-light-grey">'+
									'<h3>VocÃª estÃ¡ em um equipamento secundÃ¡rio</h3>'+
									'<p>Caso deseje ir para o equipamento primÃ¡rio <a href="' + primary_address + '">clique aqui</a>, <br />ou <a href="/' + language_set + '/html/index.html">clique aqui</a> para continuar.</p>'+
									'</div>'+
								'</div>');
						}
					} else {
						if (language_set == 'en_US') {
							$('body').html('<div class="col-md-6 page-404">'+
									'<br /><br /><br />' +
									'<div class="number font-light-red">Warning!</div>'+
									'<div class="details font-light-grey">'+
										'<h3>You are on a client device</h3>'+
										'<p>In case you want to go to the server <a href="http://' + ip + '">click here</a>, <br />or <a href="/en_US/html/index.html">click here</a> to continue.</p>'+
									'</div>'+
								'</div>');
						}
						else if (language_set == 'spa_SPA') {
							$('body').html('<div class="col-md-6 page-404">'+
									'<br /><br /><br />' +
									'<div class="number font-light-red">Â¡AtenciÃ³n!</div>'+
									'<div class="details font-light-grey">'+
										'<h3>EstÃ¡s en un equipo de cliente</h3>'+
										'<p>Si quieres ir al servidor <a href="http://' + ip + '">haga clic aquÃ­</a>, <br />o <a href="/spa_SPA/html/index.html">haga clic aquÃ­</a> para continuar.</p>'+
									'</div>'+
								'</div>');
						}
						else {
							$('body').html('<div class="col-md-6 page-404">'+
									'<br /><br /><br />' +
									'<div class="number font-light-red">AtenÃ§Ã£o!</div>'+
									'<div class="details font-light-grey">'+
										'<h3>VocÃª estÃ¡ em um equipamento cliente</h3>'+
										'<p>Caso deseje ir para o servidor <a href="http://' + ip + '">clique aqui</a>, <br />ou <a href="/' + language_set + '/html/index.html">clique aqui</a> para continuar.</p>'+
									'</div>'+
								'</div>');
						}
					}
				} else {
					window.location.replace("/" + language_set + "/html/index.html");
				}
				if (data.serial.charAt(0) === 'L' || data.serial.charAt(0) === 'K' || data.serial.charAt(0) === 'S' ||
						data.serial.substr(0, 2) === '05' || data.serial.substr(0, 2) === '09') { // Web reduzido devido Ã  solicitaÃ§Ã£o do Marcelo
					window.location.replace("/" + language_set + "/index.html");
				}
			}, apply_timeout ? 3000 : 0, lang_set);
		},
		error: erroHTTP,
		dataType: "JSON"
	});
}

$(document).ready(function() {
	var language = null;
	$.ajax({
		url: "/get_language.fcgi",
		async: false,
		type: 'GET',
		success: function(data) {
			if (!data.language){
				language = null;
				return;
			}
			language = data.language;
			if (data.language == "pt_BR") {
				document.getElementById('btnPT').classList.add('active');
			}
			else if (data.language == "en_US") {
				document.getElementById('btnEN').classList.add('active');
			}
			else if (data.language == "spa_SPA") {
				document.getElementById('btnSPA').classList.add('active');
			}
		},
		dataType: "JSON"
	});

	$('#btnPT').on('click', function () {
		language = "pt_BR";
		document.getElementById('btnPT').classList.add('active');
		document.getElementById('btnEN').classList.remove('active');
		document.getElementById('btnSPA').classList.remove('active');
		document.getElementById('h3_title').innerHTML = 'Acesse sua conta';
		document.getElementById('div_alert').innerHTML = '<span>Informe o usuÃ¡rio e a senha.</span>';
		document.getElementById('label_user').innerHTML = 'UsuÃ¡rio';
		document.getElementById('input_user').setAttribute('placeholder', 'Digite o usuÃ¡rio');
		document.getElementById('label_password').innerHTML = 'Senha';
		document.getElementById('input_password').setAttribute('placeholder', 'Digite a senha');
		document.getElementById('span_remember').innerHTML = 'Lembrar Senha';
		document.getElementById('span_login').innerHTML = 'Entrar';
	});
	$('#btnEN').on('click', function () {
		language = "en_US";
		document.getElementById('btnPT').classList.remove('active');
		document.getElementById('btnEN').classList.add('active');
		document.getElementById('btnSPA').classList.remove('active');
		document.getElementById('h3_title').innerHTML = 'Initiate Session';
		document.getElementById('div_alert').innerHTML = '<span>Inform user and password.</span>';
		document.getElementById('label_user').innerHTML = 'User';
		document.getElementById('input_user').setAttribute('placeholder', 'User name');
		document.getElementById('label_password').innerHTML = 'Password';
		document.getElementById('input_password').setAttribute('placeholder', 'Password');
		document.getElementById('span_remember').innerHTML = 'Remember password';
		document.getElementById('span_login').innerHTML = 'Log In';
	});
	$('#btnSPA').on('click', function () {
		language = "spa_SPA";
		document.getElementById('btnPT').classList.remove('active');
		document.getElementById('btnEN').classList.remove('active');
		document.getElementById('btnSPA').classList.add('active');
		document.getElementById('h3_title').innerHTML = 'Iniciar sesiÃ³n';
		document.getElementById('div_alert').innerHTML = '<span>Introduzca el usuario y la contraseÃ±a.</span>';
		document.getElementById('label_user').innerHTML = 'Persona';
		document.getElementById('input_user').setAttribute('placeholder', 'Nombre de usuario');
		document.getElementById('label_password').innerHTML = 'ContraseÃ±a';
		document.getElementById('input_password').setAttribute('placeholder', 'ContraseÃ±a');
		document.getElementById('span_remember').innerHTML = 'Olvide mi contraseÃ±a';
		document.getElementById('span_login').innerHTML = 'Entrar';
	});

	$.ajax({
		url: "/session_is_valid.fcgi",
		async: false,
		type: 'GET',
		success: function(data) {
			if(data.session_is_valid == true){
				//window.location.replace("/pt_BR/html/index.html");
			}
			else{
				localStorage.clear();
				var erro = getParameterByName("error");
				if(erro.length > 0)
					$(".alert-error").removeClass('hide').html(erro);

				document.onkeydown = function(e){
					e = e || window.event;
					if (e.keyCode == 13)
						login(language);
				}

				document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/";
			}
			$('#logar').click(function () {login(language);});
		},
		dataType: "JSON"
	});

	if($.cookie('password')){
		$("#remember").click();
		$('#input_password').val($.cookie('password'));
	}
	$('#input_user').val($.cookie('login'));

	if($('#input_user').val().length > 0 && $('#input_password').val().length > 0) {
		login(language);
	}


});

